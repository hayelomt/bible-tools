import { emptyBody, keyBetween, SEED_TAGS } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { allTags, tagsOf } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, deleteLesson } from './lessons.ts';
import { createSection } from './sections.ts';
import { addTag, removeTag, restoreTag, type TagTarget } from './tags.ts';

let db: LampDb;
let dbCount = 0;
let lesson: TagTarget;
let section: TagTarget;

beforeEach(async () => {
  db = new LampDb(`tags-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  const { id: lessonId } = await createLesson(
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
  );
  const { id: sectionId } = await createSection(
    {
      lessonId,
      parentId: null,
      orderKey: keyBetween(null, null),
      body: emptyBody(),
      conflictOf: null,
    },
    db,
  );
  lesson = { kind: 'lesson', id: lessonId };
  section = { kind: 'section', id: sectionId };
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const names = async (target: TagTarget) => (await tagsOf(target, db)).map((t) => t.tag.name);

describe('tags', () => {
  it('puts a seeded tag on a section, matching its name in any case', async () => {
    const { tag } = await addTag(section, '#Grace', db);
    expect(tag).toMatchObject({ name: 'grace', isSeeded: true });
    expect(await names(section)).toEqual(['grace']);
    expect(await db.tag.count()).toBe(SEED_TAGS.length);
    expect(await db.outbox.toArray()).toMatchObject([
      { entity: 'sectionTag', op: 'upsert', row: { tagId: tag.id, sectionId: section.id } },
    ]);
  });

  it('creates a custom tag once, whatever case it is typed in afterwards', async () => {
    const first = await addTag(section, '  Covenant   faithfulness ', db);
    expect(first.tag).toMatchObject({ name: 'Covenant faithfulness', isSeeded: false });
    const again = await addTag(lesson, 'covenant FAITHFULNESS', db);
    expect(again.tag.id).toBe(first.tag.id);

    const custom = (await allTags(db)).filter((t) => !t.isSeeded);
    expect(custom.map((t) => t.name)).toEqual(['Covenant faithfulness']);
    expect(await names(lesson)).toEqual(['Covenant faithfulness']);
    // Queued, so it syncs with the links that use it.
    expect((await db.outbox.toArray()).map((c) => c.entity)).toEqual([
      'tag',
      'sectionTag',
      'lessonTag',
    ]);
  });

  it('two tabs creating the same new name at once still make one tag', async () => {
    await Promise.all([addTag(section, 'Covenant', db), addTag(lesson, 'covenant', db)]);
    expect((await allTags(db)).filter((t) => !t.isSeeded)).toHaveLength(1);
  });

  it('tagging twice with the same tag adds one link', async () => {
    const first = await addTag(section, 'hope', db);
    const second = await addTag(section, 'Hope', db);
    expect(second.link).toEqual(first.link);
    expect(await names(section)).toEqual(['hope']);
  });

  it('keeps the order tags were added in', async () => {
    for (const name of ['prayer', 'grace', 'faith']) await addTag(section, name, db);
    expect(await names(section)).toEqual(['prayer', 'grace', 'faith']);
  });

  it('refuses an empty name, or a target that was deleted, and stores nothing', async () => {
    await expect(addTag(section, ' # ', db)).rejects.toThrow('A tag needs a name');
    await deleteLesson(lesson.id, db);
    await db.outbox.clear();
    await expect(addTag(lesson, 'New one', db)).rejects.toThrow('No lesson');
    expect(await db.outbox.count()).toBe(0);
    expect((await allTags(db)).filter((t) => !t.isSeeded)).toEqual([]);
  });

  it('removes a tag from an item, keeps the tag, and Undo puts it back', async () => {
    const { tag, link } = await addTag(section, 'Covenant', db);
    await removeTag(link, db);
    expect(await names(section)).toEqual([]);
    expect((await allTags(db)).map((t) => t.id)).toContain(tag.id);

    await restoreTag(link, db);
    expect(await tagsOf(section, db)).toEqual([{ tag, link }]);
  });

  it('Undo adds nothing when the tag was put back on meanwhile', async () => {
    const { link } = await addTag(section, 'grace', db);
    await removeTag(link, db);
    const again = await addTag(section, 'grace', db);
    await restoreTag(link, db);
    expect((await tagsOf(section, db)).map((t) => t.link)).toEqual([again.link]);
  });

  it('a lesson delete takes its tags off with it', async () => {
    await addTag(lesson, 'grace', db);
    await addTag(section, 'hope', db);
    await deleteLesson(lesson.id, db);
    expect(await names(lesson)).toEqual([]);
    expect(await names(section)).toEqual([]);
  });
});
