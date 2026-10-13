import { keyBetween, type SectionBody } from '@lamp/domain';
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
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
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
