import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLesson, deleteLesson, type LessonFields } from './actions/lessons.ts';
import { gradeMemoryItem, memorise } from './actions/memory.ts';
import { addQuestion, promoteQuestion, setParked } from './actions/questions.ts';
import { updateSettings } from './actions/settings.ts';
import { createTakeaway, removeTakeaway } from './actions/takeaways.ts';
import { LampDb, SETTINGS_KEY } from './db.ts';
import { openQuestions, recentTakeaways, reviewCount } from './review.ts';
import { ensureDevice } from './setup.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`review-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
});

afterEach(async () => {
  await db.delete();
});

const lessonOn = (title: string, date: string) => {
  const fields: LessonFields = {
    seriesId: null,
    title,
    date,
    source: 'sermon',
    speaker: null,
    church: null,
    mainPassages: [],
  };
  return createLesson(fields, db);
};

/** Local noon on `date`, so the device's calendar day is `date` whatever its time zone. */
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();

/** A takeaway written at `createdAt` (the action stamps its own time). */
async function takeawayAt(lessonId: string, text: string, createdAt: string) {
  const takeaway = await createTakeaway({ lessonId, text }, db);
  await db.takeaway.update(takeaway.id, { createdAt });
  return takeaway;
}

describe('openQuestions', () => {
  it('lists open questions, newest lesson first, then as asked; not parked, answered or deleted', async () => {
    const vine = await lessonOn('Abiding in the vine', '2026-10-05');
    const shepherd = await lessonOn('The Good Shepherd', '2026-10-12');
    const fruit = await addQuestion(vine.id, 'What is the fruit?', db);
    const sheep = await addQuestion(shepherd.id, 'Who are the other sheep?', db);
    const thief = await addQuestion(shepherd.id, 'Thief vs hired hand?', db);
    const parked = await addQuestion(shepherd.id, 'Parked one', db);
    await setParked(parked.id, true, db);

    const texts = async () => (await openQuestions(db)).map((q) => q.question.text);
    expect(await texts()).toEqual([sheep.text, thief.text, fruit.text]);
    expect((await openQuestions(db))[0]?.lesson.title).toBe('The Good Shepherd');

    // An answer section without an answer leaves the question open.
    await promoteQuestion(sheep.id, undefined, db);
    expect(await texts()).toEqual([sheep.text, thief.text, fruit.text]);

    await deleteLesson(vine.id, db);
    expect(await texts()).toEqual([sheep.text, thief.text]);
  });
});

describe('recentTakeaways', () => {
  it('lists the takeaways of the last N days, today included, newest first', async () => {
    const lesson = await lessonOn('The Good Shepherd', '2026-10-12');
    await takeawayAt(lesson.id, 'Today', at('2026-10-14'));
    await takeawayAt(lesson.id, 'Thirteen days ago', at('2026-10-01'));
    await takeawayAt(lesson.id, 'Fourteen days ago', at('2026-09-30'));
    const gone = await takeawayAt(lesson.id, 'Deleted', at('2026-10-13'));
    await removeTakeaway(gone.id, db);

    const texts = async (days: number) =>
      (await recentTakeaways('2026-10-14', days, db)).map((t) => t.takeaway.text);
    expect(await texts(14)).toEqual(['Today', 'Thirteen days ago']);
    expect(await texts(30)).toEqual(['Today', 'Thirteen days ago', 'Fourteen days ago']);
    expect(await texts(1)).toEqual(['Today']);

    await deleteLesson(lesson.id, db);
    expect(await texts(30)).toEqual([]);
  });
});

describe('reviewCount', () => {
  it('counts open questions and the verses due today', async () => {
    const lesson = await lessonOn('The Good Shepherd', '2026-10-12');
    await addQuestion(lesson.id, 'Who are the other sheep?', db);
    const ref = {
      book: 'JHN' as const,
      chapter: 10,
      verseStart: 27,
      display: 'John 10:27',
      translation: 'WEB' as const,
    };
    const { item } = await memorise(ref, '2026-10-14', db);
    await memorise({ ...ref, verseStart: 28, display: 'John 10:28' }, '2026-10-14', db);
    expect(await reviewCount('2026-10-14', db)).toEqual({ questions: 1, verses: 2 });

    await gradeMemoryItem(item.id, 'good', '2026-10-14', db);
    expect(await reviewCount('2026-10-14', db)).toEqual({ questions: 1, verses: 1 });
    expect(await reviewCount('2026-10-15', db)).toEqual({ questions: 1, verses: 2 });
  });
});

describe('the window setting', () => {
  it('is stored as a settings change, which syncs', async () => {
    await db.outbox.clear();
    await updateSettings({ reviewWindowDays: 30 }, db);
    expect((await db.userSettings.get(SETTINGS_KEY))?.reviewWindowDays).toBe(30);
    const [change] = await db.outbox.toArray();
    expect(change).toMatchObject({ entity: 'userSettings', op: 'upsert' });
  });
});
