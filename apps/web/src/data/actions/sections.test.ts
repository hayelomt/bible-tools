import { emptyBody, keyBetween, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { action } from '../action.ts';
import { LampDb } from '../db.ts';
import { conflictCounts, lessonSections } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson } from './lessons.ts';
import {
  createSection,
  keepConflictedCopy,
  removeSection,
  restoreSections,
  updateSection,
} from './sections.ts';

const text = (t: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

let db: LampDb;
let dbCount = 0;
let lessonId: string;

beforeEach(async () => {
  db = new LampDb(`sections-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  ({ id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      source: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    },
    db,
  ));
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const section = (
  fields: {
    id?: string;
    parentId?: string | null;
    orderKey?: string;
    body?: SectionBody;
    conflictOf?: string | null;
    conflictDevice?: string | null;
  } = {},
) =>
  createSection(
    {
      lessonId,
      parentId: null,
      orderKey: keyBetween(null, null),
      body: emptyBody(),
      conflictOf: null,
      conflictDevice: null,
      ...fields,
    },
    db,
  );

describe('sections', () => {
  it('stores a section with the id the editor gave its draft, and queues it', async () => {
    const id = '0199e000-0000-7000-8000-0000000000aa';
    await section({ id, body: text('Jesus is the door') });
    expect((await lessonSections(lessonId, db)).map((s) => s.id)).toEqual([id]);
    expect(await db.outbox.toArray()).toMatchObject([{ entity: 'section', entityId: id }]);
  });

  it('updates the body, and moves a section under another', async () => {
    const parent = await section({ body: text('A') });
    const { id } = await section({ body: text('B') });
    await updateSection(id, { body: text('B, edited') }, db);
    await updateSection(id, { parentId: parent.id, orderKey: keyBetween(null, null) }, db);
    const stored = await db.section.get(id);
    expect(stored).toMatchObject({ parentId: parent.id, body: text('B, edited') });
  });

  it('refuses a body the schema rejects, and stores nothing', async () => {
    const bad = { type: 'doc', content: [{ type: 'codeBlock' }] } as unknown as SectionBody;
    await expect(section({ body: bad })).rejects.toThrow('Invalid discriminator value');
    expect(await db.section.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('removes an emptied section with its tags, but not one with replies', async () => {
    const { id } = await section();
    const tag = (await db.tag.toArray())[0]!;
    await action(db, (w) => w.create('sectionTag', { tagId: tag.id, sectionId: id }));
    await removeSection(id, {}, db);
    expect(await lessonSections(lessonId, db)).toEqual([]);
    expect((await db.sectionTag.toArray()).every((t) => t.deletedAt !== null)).toBe(true);

    const parent = await section();
    await section({ parentId: parent.id });
    await expect(removeSection(parent.id, {}, db)).rejects.toThrow('has replies');
    expect(await lessonSections(lessonId, db)).toHaveLength(2);
  });

  it('deletes a section with its replies and their tags, and Undo brings back just those', async () => {
    const tag = (await db.tag.toArray())[0]!;
    const parent = await section({ body: text('A') });
    const reply = await section({ parentId: parent.id, body: text('A, reply') });
    const other = await section({ body: text('B') });
    for (const s of [parent, reply]) {
      await action(db, (w) => w.create('sectionTag', { tagId: tag.id, sectionId: s.id }));
    }
    // Deleted earlier, and not part of this delete.
    const old = await section({ parentId: parent.id, body: text('A, old reply') });
    await removeSection(old.id, {}, db);
    const before = await db.section.toArray();

    const removed = await removeSection(parent.id, { withReplies: true }, db);
    expect(removed.sections.toSorted()).toEqual([parent.id, reply.id].toSorted());
    expect(removed.sectionTags).toHaveLength(2);
    expect((await lessonSections(lessonId, db)).map((s) => s.id)).toEqual([other.id]);

    await restoreSections(removed, db);
    const after = await lessonSections(lessonId, db);
    expect(after.map((s) => s.id).toSorted()).toEqual([parent.id, reply.id, other.id].toSorted());
    expect(after.find((s) => s.id === reply.id)).toMatchObject({
      parentId: parent.id,
      orderKey: before.find((s) => s.id === reply.id)!.orderKey,
    });
    expect((await db.sectionTag.toArray()).every((t) => t.deletedAt === null)).toBe(true);
    expect((await db.section.get(old.id))?.deletedAt).not.toBeNull();
  });
});

const tagIds = async (sectionId: string) =>
  (await db.sectionTag.where('sectionId').equals(sectionId).toArray())
    .filter((t) => t.deletedAt === null)
    .map((t) => t.tagId);

describe('conflicted copies (§6.4)', () => {
  it('"Keep this instead" moves the copy\'s text, replies and tags to its section', async () => {
    const original = await section({ orderKey: 'a0', body: text('Jesus is the door') });
    const copy = await section({
      orderKey: 'a1',
      body: text('Jesus is the gate'),
      conflictOf: original.id,
      conflictDevice: 'Firefox on macOS',
    });
    const [grace, hope] = await db.tag.limit(2).toArray();
    await action(db, async (w) => {
      await w.create('sectionTag', { tagId: grace!.id, sectionId: original.id });
      await w.create('sectionTag', { tagId: grace!.id, sectionId: copy.id });
      await w.create('sectionTag', { tagId: hope!.id, sectionId: copy.id });
    });
    const own = await section({ parentId: original.id, orderKey: 'a0', body: text('mine') });
    const moved = await section({ parentId: copy.id, orderKey: 'a0', body: text('reply') });
    expect((await conflictCounts(db)).get(lessonId)).toBe(1);
    await db.outbox.clear();

    await keepConflictedCopy(copy.id, db);

    expect(await db.section.get(original.id)).toMatchObject({ body: text('Jesus is the gate') });
    expect(await db.section.get(copy.id)).toMatchObject({ deletedAt: expect.any(String) });
    const reply = await db.section.get(moved.id);
    expect(reply).toMatchObject({ parentId: original.id });
    expect(reply!.orderKey > own.orderKey).toBe(true);
    expect((await tagIds(original.id)).toSorted()).toEqual([grace!.id, hope!.id].toSorted());
    expect(await tagIds(copy.id)).toEqual([]);
    expect((await conflictCounts(db)).get(lessonId)).toBeUndefined();
    // One action: every write is queued to sync.
    const queued = await db.outbox.toArray();
    expect(queued.map((e) => `${e.entity}:${e.op}`)).toEqual(
      expect.arrayContaining(['section:upsert', 'sectionTag:upsert', 'section:delete']),
    );
  });

  it('a copy whose section was deleted becomes an ordinary section', async () => {
    const original = await section({ orderKey: 'a0', body: text('door') });
    const copy = await section({
      orderKey: 'a1',
      body: text('gate'),
      conflictOf: original.id,
      conflictDevice: null,
    });
    await removeSection(original.id, {}, db);
    await keepConflictedCopy(copy.id, db);
    expect(await db.section.get(copy.id)).toMatchObject({
      body: text('gate'),
      conflictOf: null,
      conflictDevice: null,
      deletedAt: null,
    });
  });
});
