import { emptyBody, keyBetween, type VerseRef } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { action } from '../action.ts';
import { LampDb } from '../db.ts';
import { allLessons, allSeries, lessonById, seriesLessons } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, deleteLesson, type LessonFields, updateLesson } from './lessons.ts';
import { createSeries, deleteSeries, updateSeries } from './series.ts';

const JHN_10: VerseRef = {
  book: 'JHN',
  chapter: 10,
  verseStart: 1,
  verseEnd: 18,
  display: 'John 10:1–18',
  translation: 'BSB',
};

const lesson = (fields: Partial<LessonFields> = {}): LessonFields => ({
  seriesId: null,
  title: 'The Good Shepherd',
  date: '2026-10-12',
  source: 'sermon',
  speaker: null,
  church: null,
  mainPassages: [],
  ...fields,
});

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`lessons-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

describe('lessons', () => {
  it('creates a lesson with only a title, and indexes its main passages', async () => {
    const plain = await createLesson(lesson({ title: '  Morning study ' }), db);
    expect(plain.title).toBe('Morning study');
    expect(await db.citation.count()).toBe(0);

    const { id } = await createLesson(lesson({ mainPassages: [JHN_10] }), db);
    const citations = await db.citation.where('sourceId').equals(id).toArray();
    expect(citations).toMatchObject([{ sourceType: 'lesson', lessonId: id, book: 'JHN' }]);
    expect(await db.outbox.count()).toBe(2);
  });

  it('keeps the id it was given, so a draft keeps its address', async () => {
    const id = '0199e000-0000-7000-8000-000000000001';
    await createLesson({ ...lesson(), id }, db);
    expect((await lessonById(id, db))?.title).toBe('The Good Shepherd');
  });

  it('refuses an empty title', async () => {
    await expect(createLesson(lesson({ title: ' ' }), db)).rejects.toThrow('Too small');
    expect(await db.lesson.count()).toBe(0);
  });

  it('lists lessons newest first, and same-day lessons in the order they were made', async () => {
    const a = await createLesson(lesson({ title: 'A', date: '2026-10-05' }), db);
    const b = await createLesson(lesson({ title: 'B', date: '2026-10-12' }), db);
    const c = await createLesson(lesson({ title: 'C', date: '2026-10-12' }), db);
    await deleteLesson(a.id, db);
    expect((await allLessons(db)).map((l) => l.title)).toEqual([c.title, b.title]);
  });

  it('deletes a lesson with its sections, tags, takeaways and questions', async () => {
    const { id } = await createLesson(lesson({ mainPassages: [JHN_10] }), db);
    const other = await createLesson(lesson({ title: 'Other' }), db);
    await action(db, async (w) => {
      const tag = (await w.db.tag.toArray())[0]!;
      const section = await w.create('section', {
        lessonId: id,
        parentId: null,
        orderKey: keyBetween(null, null),
        body: emptyBody(),
        conflictOf: null,
        conflictDevice: null,
      });
      await w.create('sectionTag', { tagId: tag.id, sectionId: section.id });
      await w.create('lessonTag', { tagId: tag.id, lessonId: id });
      await w.create('takeaway', { lessonId: id, text: 'He knows his sheep.' });
      await w.create('question', {
        lessonId: id,
        text: 'Who are the other sheep?',
        status: 'open',
        answerSectionId: null,
      });
    });

    await deleteLesson(id, db);

    for (const table of ['lesson', 'section', 'sectionTag', 'lessonTag', 'takeaway', 'question']) {
      const rows = await db.table(table).toArray();
      expect(rows.filter((r) => r.deletedAt === null && r.id !== other.id)).toEqual([]);
    }
    expect(await db.citation.where('sourceId').equals(id).count()).toBe(0);
    const deletes = await db.outbox.filter((c) => c.op === 'delete').toArray();
    expect(deletes.map((c) => c.entity).toSorted()).toEqual(
      ['lesson', 'lessonTag', 'question', 'section', 'sectionTag', 'takeaway'].toSorted(),
    );
  });
});

describe('series', () => {
  const series = { title: 'John', description: '', kind: 'book_study' as const };

  it('lists lessons in date order and counts them', async () => {
    const john = await createSeries(series, db);
    await createSeries({ ...series, title: 'Acts' }, db);
    await createLesson(lesson({ title: 'Later', date: '2026-10-19', seriesId: john.id }), db);
    await createLesson(lesson({ title: 'Earlier', date: '2026-10-05', seriesId: john.id }), db);
    await createLesson(lesson({ title: 'Loose' }), db);

    expect((await seriesLessons(john.id, db)).map((l) => l.title)).toEqual(['Earlier', 'Later']);
    expect((await allSeries(db)).map((s) => [s.title, s.lessonCount])).toEqual([
      ['Acts', 0],
      ['John', 2],
    ]);
  });

  it('renames a series', async () => {
    const { id } = await createSeries(series, db);
    await updateSeries(id, { title: 'The Gospel of John' }, db);
    expect((await allSeries(db))[0]?.title).toBe('The Gospel of John');
  });

  it('moves a lesson between series and out of one', async () => {
    const john = await createSeries(series, db);
    const acts = await createSeries({ ...series, title: 'Acts' }, db);
    const { id } = await createLesson(lesson({ seriesId: john.id }), db);

    await updateLesson(id, { seriesId: acts.id }, db);
    expect(await seriesLessons(john.id, db)).toEqual([]);
    expect((await seriesLessons(acts.id, db)).map((l) => l.id)).toEqual([id]);

    await updateLesson(id, { seriesId: null }, db);
    expect(await seriesLessons(acts.id, db)).toEqual([]);
    expect((await allLessons(db)).map((l) => l.id)).toEqual([id]);
  });

  it('deletes a series and keeps its lessons, without a series', async () => {
    const john = await createSeries(series, db);
    const { id } = await createLesson(lesson({ seriesId: john.id }), db);

    await deleteSeries(john.id, db);

    expect(await allSeries(db)).toEqual([]);
    expect((await lessonById(id, db))?.seriesId).toBeNull();
  });
});
