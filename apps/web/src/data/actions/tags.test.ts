import { emptyBody, keyBetween, SEED_TAGS } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { allTags, taggedWith, tagsOf } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, deleteLesson } from './lessons.ts';
import { createSection } from './sections.ts';
import {
  addTag,
  deleteTag,
  removeTag,
  renameTag,
  restoreTag,
  TagNameTakenError,
  type TagTarget,
} from './tags.ts';

let db: LampDb;
let dbCount = 0;
let lesson: TagTarget;
let section: TagTarget;

beforeEach(async () => {
  db = new LampDb(`tags-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  const { id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
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
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
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

  it('renames a tag everywhere it is used, and a change of case is a rename', async () => {
    const { tag } = await addTag(section, 'covenant', db);
    await addTag(lesson, 'covenant', db);
    await renameTag(tag.id, ' #Covenant  love ', db);
    expect(await names(section)).toEqual(['Covenant love']);
    expect(await names(lesson)).toEqual(['Covenant love']);
    await renameTag(tag.id, 'covenant LOVE', db);
    expect(await names(section)).toEqual(['covenant LOVE']);
  });

  it('refuses a rename to a name another tag has, in any case', async () => {
    const { tag } = await addTag(section, 'covenant', db);
    await db.outbox.clear();
    const error = await renameTag(tag.id, 'HOPE', db).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TagNameTakenError);
    expect((error as TagNameTakenError).existing.name).toBe('hope');
    expect(await names(section)).toEqual(['covenant']);
    expect(await db.outbox.count()).toBe(0);
  });

  it('deleting a tag takes it off every note, and the name can be used again', async () => {
    const { tag } = await addTag(section, 'grace', db);
    await addTag(lesson, 'grace', db);
    await addTag(section, 'hope', db);
    await deleteTag(tag.id, db);
    expect(await names(section)).toEqual(['hope']);
    expect(await names(lesson)).toEqual([]);
    expect((await allTags(db)).map((t) => t.name)).not.toContain('grace');
    expect(await taggedWith(tag.id, db)).toEqual([]);

    const again = await addTag(section, 'Grace', db);
    expect(again.tag).toMatchObject({ name: 'Grace', isSeeded: false });
  });
});

const newLesson = (title: string, date: string) =>
  createLesson(
    {
      seriesId: null,
      title,
      date,
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: [],
    },
    db,
  );
const newSection = (lessonId: string, orderKey: string, parentId: string | null = null) =>
  createSection(
    {
      lessonId,
      parentId,
      orderKey,
      body: emptyBody(),
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  );

describe('tag page', () => {
  it('groups tagged sections and lessons by lesson, newest lesson first, sections in reading order', async () => {
    const older = await newLesson('Abiding in the vine', '2026-10-05');
    const first = await newSection(older.id, keyBetween(null, null));
    const second = await newSection(older.id, keyBetween(first.orderKey, null));
    const reply = await newSection(older.id, keyBetween(null, null), first.id);
    for (const s of [second, reply, first])
      await addTag({ kind: 'section', id: s.id }, 'grace', db);
    const { tag } = await addTag(lesson, 'grace', db);
    // Untagged notes don't show.
    await addTag(section, 'hope', db);

    const groups = await taggedWith(tag.id, db);
    expect(groups.map((g) => [g.lesson.title, g.lessonTagged])).toEqual([
      ['The Good Shepherd', true],
      ['Abiding in the vine', false],
    ]);
    expect(groups[0]?.sections).toEqual([]);
    expect(groups[1]?.sections.map((s) => s.id)).toEqual([first.id, reply.id, second.id]);
  });

  it('shows a section as soon as it is tagged, and not once the tag is taken off', async () => {
    const { tag, link } = await addTag(section, 'grace', db);
    expect((await taggedWith(tag.id, db))[0]?.sections.map((s) => s.id)).toEqual([section.id]);
    await removeTag(link, db);
    expect(await taggedWith(tag.id, db)).toEqual([]);
  });
});
