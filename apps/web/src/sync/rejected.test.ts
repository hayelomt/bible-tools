import { keyBetween, OPEN_IN_TARGETS, type SectionBody } from '@lamp/domain';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { action } from '@/data/action.ts';
import { LampDb } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { rejectedChanges } from './rejected.ts';

const body = (text: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`rejected-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

/** Marks the outbox's changes to a row as refused, as `settleBatch` would. */
const refuse = (entityId: string, errorCode: string, message: string) =>
  db.outbox
    .filter((entry) => 'entityId' in entry && entry.entityId === entityId)
    .modify({ sent: true, rejected: { errorCode, message } });

describe('refused changes in the sync panel (§6.2)', () => {
  it('names what each was, why in words, and where to open it', async () => {
    const { lesson, section, tag } = await action(db, async (w) => {
      const created = await w.create('lesson', {
        seriesId: null,
        title: 'The Good Shepherd',
        date: '2026-10-12',
        source: 'sermon',
        speaker: null,
        church: null,
        mainPassages: [],
      });
      const note = await w.create('section', {
        lessonId: created.id,
        parentId: null,
        orderKey: keyBetween(null, null),
        body: body('Jesus is the door'),
        conflictOf: null,
        conflictDevice: null,
      });
      const shepherds = await w.create('tag', { name: 'Shepherds', isSeeded: false });
      return { lesson: created, section: note, tag: shepherds };
    });
    await refuse(section.id, 'INVALID_CHANGE', 'row.body: Invalid input');
    await refuse(tag.id, 'DUPLICATE', 'Another row already has this value');

    expect(await rejectedChanges(db)).toEqual([
      {
        seq: expect.any(Number),
        what: 'Section in "The Good Shepherd"',
        reason: "The server refused it: something in it isn't valid.",
        details: 'INVALID_CHANGE: row.body: Invalid input',
        target: { kind: 'lesson', lessonId: lesson.id, search: { section: section.id } },
      },
      {
        seq: expect.any(Number),
        what: 'Tag "Shepherds"',
        reason: 'The server refused it: another one already has the same name.',
        details: 'DUPLICATE: Another row already has this value',
        target: { kind: 'tag', tagId: tag.id },
      },
    ]);
  });

  it('lists only refused changes', async () => {
    await action(db, (w) => w.create('tag', { name: 'Waiting', isSeeded: false }));
    expect(await rejectedChanges(db)).toEqual([]);
  });
});

describe('Dexie version 4', () => {
  it('adds conflictDevice to stored sections and to queued section changes', async () => {
    const name = `upgrade-${++dbCount}`;
    const old = new Dexie(name, { indexedDB, IDBKeyRange });
    old
      .version(3)
      .stores({ section: 'id, lessonId, parentId', outbox: '++seq, [entity+entityId]' });
    const row = { id: 's1', lessonId: 'l1', parentId: null, conflictOf: null };
    await old.table('section').add(row);
    await old.table('outbox').add({ entity: 'section', entityId: 's1', op: 'upsert', row });
    await old.table('outbox').add({ entity: 'section', entityId: 's2', op: 'delete' });
    old.close();

    const upgraded = new LampDb(name, { indexedDB, IDBKeyRange });
    expect(await upgraded.section.get('s1')).toMatchObject({ conflictDevice: null });
    const [upsert, remove] = await upgraded.outbox.toArray();
    expect(upsert).toMatchObject({ row: { conflictDevice: null } });
    expect(remove).not.toHaveProperty('row');
    // Copies are indexed; null isn't, so ordinary sections stay out of it.
    expect(await upgraded.section.orderBy('conflictOf').count()).toBe(0);
    await upgraded.delete();
  });
});

describe('Dexie version 7', () => {
  it('adds pasteChips and openInTargets to the settings and to queued settings changes', async () => {
    const name = `upgrade-${++dbCount}`;
    const old = new Dexie(name, { indexedDB, IDBKeyRange });
    old.version(6).stores({ userSettings: '', outbox: '++seq, [entity+entityId]' });
    const row = { colorMode: 'dark', reviewWindowDays: 7, rev: 3 };
    await old.table('userSettings').put(row, 'settings');
    await old.table('outbox').add({
      entity: 'userSettings',
      entityId: 'settings',
      op: 'upsert',
      row,
      changed: ['colorMode'],
    });
    old.close();

    const upgraded = new LampDb(name, { indexedDB, IDBKeyRange });
    const defaults = { pasteChips: true, openInTargets: [...OPEN_IN_TARGETS] };
    expect(await upgraded.userSettings.get('settings')).toMatchObject({ ...row, ...defaults });
    const [queued] = await upgraded.outbox.toArray();
    expect(queued).toMatchObject({ row: defaults, changed: ['colorMode'] });
    await upgraded.delete();
  });
});

const at = (minute: number) => `2026-03-01T09:0${minute}:00.000Z`;
const id = (n: number) => `0199e0a0-0000-7000-8000-00000000000${n}`;

describe('Dexie version 8', () => {
  it('turns question statuses into entries for questions the server never had, and drops them', async () => {
    const name = `upgrade-${++dbCount}`;
    const old = new Dexie(name, { indexedDB, IDBKeyRange });
    old.version(7).stores({
      question: 'id, lessonId, status',
      section: 'id, lessonId, parentId, conflictOf',
      outbox: '++seq, [entity+entityId]',
    });
    const lessonId = id(9);
    const answer = { id: id(8), lessonId, createdAt: at(5), deletedAt: null };
    const question = (
      n: number,
      status: string,
      rev: number,
      answerSectionId: string | null = null,
    ) => ({
      id: id(n),
      lessonId,
      text: `Question ${n}`,
      status,
      answerSectionId,
      createdAt: at(1),
      updatedAt: at(7),
      rev,
      deletedAt: null,
    });
    const rows = [
      question(1, 'open', 0),
      question(2, 'answered', 0, answer.id),
      question(3, 'parked', 0),
      // Synced, and parked here since, not yet pushed.
      question(4, 'parked', 3),
      // Synced and unchanged: the server's migration gives it its entries.
      question(5, 'answered', 3, answer.id),
    ];
    await old.table('section').put(answer);
    await old.table('question').bulkPut(rows);
    const { rev: _, ...row4 } = rows[3]!;
    await old.table('outbox').add({
      entity: 'question',
      entityId: id(4),
      op: 'upsert',
      row: row4,
      changed: ['status', 'updatedAt'],
    });
    old.close();

    const upgraded = new LampDb(name, { indexedDB, IDBKeyRange });
    const entries = await upgraded.questionEntry.toArray();
    const thread = (n: number) =>
      entries
        .filter((e) => e.questionId === id(n))
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((e) => [e.kind, e.sectionId, e.createdAt]);
    expect(thread(1)).toEqual([['asked', null, at(1)]]);
    expect(thread(2)).toEqual([
      ['asked', null, at(1)],
      ['answered', answer.id, at(5)],
    ]);
    expect(thread(3)).toEqual([
      ['asked', null, at(1)],
      ['parked', null, at(7)],
    ]);
    expect(thread(4)).toEqual([['parked', null, at(7)]]);
    expect(thread(5)).toEqual([]);
    expect(entries.every((e) => e.rev === 0 && e.lessonId === lessonId)).toBe(true);

    // The questions and their queued changes lose the fields; each entry is queued.
    for (const stored of await upgraded.question.toArray()) {
      expect(stored).not.toHaveProperty('status');
      expect(stored).not.toHaveProperty('answerSectionId');
    }
    const queued = await upgraded.outbox.toArray();
    expect(queued[0]).toMatchObject({ entity: 'question', changed: ['updatedAt'] });
    expect(queued[0]).not.toHaveProperty('row.status');
    expect(queued.slice(1).map((c) => c.entity)).toEqual(entries.map(() => 'questionEntry'));
    await upgraded.delete();
  });
});

describe('Dexie version 9', () => {
  it('adds splitFromId to stored questions and to queued question changes', async () => {
    const name = `upgrade-${++dbCount}`;
    const old = new Dexie(name, { indexedDB, IDBKeyRange });
    old.version(8).stores({
      question: 'id, lessonId',
      questionEntry: 'id, questionId, lessonId, sectionId',
      outbox: '++seq, [entity+entityId]',
    });
    const row = {
      id: id(1),
      lessonId: id(9),
      text: 'Who are the other sheep?',
      createdAt: at(1),
      updatedAt: at(1),
      rev: 0,
      deletedAt: null,
    };
    await old.table('question').put(row);
    const { rev: _, ...sent } = row;
    await old.table('outbox').add({ entity: 'question', entityId: id(1), op: 'upsert', row: sent });
    old.close();

    const upgraded = new LampDb(name, { indexedDB, IDBKeyRange });
    expect(await upgraded.question.get(id(1))).toEqual({ ...row, splitFromId: null });
    const [queued] = await upgraded.outbox.toArray();
    expect(queued).toMatchObject({ row: { ...sent, splitFromId: null } });
    await upgraded.delete();
  });
});
