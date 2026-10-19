import { formatPassage, keyBetween, type Passage, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLesson } from './actions/lessons.ts';
import { addQuestion, parkQuestion, reopenQuestion } from './actions/questions.ts';
import { dismissResurfaced, recordVisit, undoDismissal } from './actions/resurface.ts';
import { createSection } from './actions/sections.ts';
import { updateSettings } from './actions/settings.ts';
import { LampDb } from './db.ts';
import { backAgain, type ResurfacedItem } from './resurface.ts';
import { openQuestions, reviewCount } from './review.ts';
import { ensureDevice } from './setup.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  // The actions stamp the clock's time; today is TODAY.
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(at(TODAY)) });
  db = new LampDb(`resurface-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

/** Wednesday 21 October 2026: a year ago is the week of 20–26 October 2025. */
const TODAY = '2026-10-21';
/** Local noon on `date`, so the device's calendar day is `date` whatever its time zone. */
const at = (date: string) => new Date(`${date}T12:00:00`).toISOString();

const ROM_8_28: Passage = { book: 'ROM', chapter: 8, verseStart: 28 };
const chip = (p: Passage) => ({
  type: 'verse' as const,
  attrs: { ...p, display: formatPassage(p) },
});
const citing = (p: Passage): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'On ' }, chip(p)] }],
});

const lessonOn = (title: string, date: string) =>
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

let order: string | null = null;
const sectionIn = (lessonId: string, body: SectionBody) => {
  order = keyBetween(order, null);
  return createSection(
    {
      lessonId,
      parentId: null,
      orderKey: order,
      body,
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  );
};

/** A question asked on `date`: its row and its `asked` entry. */
async function askedOn(lessonId: string, text: string, date: string) {
  const question = await addQuestion(lessonId, text, db);
  await db.question.update(question.id, { createdAt: at(date) });
  await db.questionEntry
    .where('questionId')
    .equals(question.id)
    .modify({ createdAt: at(date) });
  return question;
}

const shape = (items: ResurfacedItem[]) =>
  items.map((item) => {
    switch (item.rule) {
      case 'year_ago':
        return `year ${item.lesson.title} (${item.years}) ${item.questions.map((q) => q.text)}`;
      case 'repeated_verse':
        return `verse ${formatPassage(item.passage)} (${item.lessons})`;
      case 'stale_question':
        return `stale ${item.question.text} since ${item.since}`;
    }
  });

describe('a year ago', () => {
  it('brings back the lessons from the same week in earlier years, with their open questions', async () => {
    const before = await lessonOn('The Sunday before', '2025-10-19');
    const light = await lessonOn('Light of the world', '2025-10-26');
    await lessonOn('Two years on', '2024-10-21');
    await lessonOn('The Monday after', '2025-10-27');
    await lessonOn('This year', '2026-10-19');
    await sectionIn(light.id, citing(ROM_8_28));
    const open = await askedOn(light.id, 'Why light?', '2025-10-26');
    const parked = await askedOn(light.id, 'Parked', '2025-10-26');
    await parkQuestion(parked.id, db);
    await askedOn(before.id, 'Not this week', '2025-10-19');

    const { items, questionIds } = await backAgain(TODAY, db);
    expect(shape(items)).toEqual([
      'year Light of the world (1) Why light?',
      'year Two years on (2) ',
      // 19 October 2025's question is open over 90 days, and that lesson isn't a year ago.
      'stale Not this week since 2025-10-19',
    ]);
    expect(items[0]).toMatchObject({ sections: 1, targetKey: light.id });
    // Shown under its lesson, so not under Open questions too.
    expect(questionIds.has(open.id)).toBe(true);
    const listed = (await openQuestions(db)).filter((q) => !questionIds.has(q.question.id));
    expect(listed.map((q) => q.question.text)).toEqual([]);
  });
});

describe('repeated verse', () => {
  it('brings back a verse cited in three lessons until its commentary is opened', async () => {
    for (const date of ['2026-01-04', '2026-03-01', '2026-05-03']) {
      const lesson = await lessonOn(`On ${date}`, date);
      await sectionIn(lesson.id, citing(ROM_8_28));
    }
    expect(shape((await backAgain(TODAY, db)).items)).toEqual(['verse Romans 8:28 (3)']);
    expect((await backAgain(TODAY, db)).items[0]).toMatchObject({
      targetKey: 'ROM.8.28',
      lastVisit: null,
    });

    // Opening Romans 8 as a commentary takes it out.
    await recordVisit({ book: 'ROM', chapter: 8 }, TODAY, db);
    expect((await backAgain(TODAY, db)).items).toEqual([]);
    // Six months and a day later it's back.
    expect(shape((await backAgain('2027-04-22', db)).items)).toEqual(['verse Romans 8:28 (3)']);
    expect((await backAgain('2027-04-21', db)).items).toEqual([]);
  });
});

describe('stale question', () => {
  it('is an open question asked or reopened more than 90 days ago, shown instead of in Open questions', async () => {
    const lesson = await lessonOn('Lazarus', '2026-07-05');
    const old = await askedOn(lesson.id, 'Why wait two days?', '2026-07-22');
    await askedOn(lesson.id, 'Exactly 90 days', '2026-07-23');
    const reopened = await askedOn(lesson.id, 'Reopened lately', '2026-06-01');
    await reopenQuestion(reopened.id, db);

    const { items, questionIds } = await backAgain(TODAY, db);
    expect(shape(items)).toEqual(['stale Why wait two days? since 2026-07-22']);
    const listed = (await openQuestions(db)).filter((q) => !questionIds.has(q.question.id));
    expect(listed.map((q) => q.question.text).toSorted()).toEqual([
      'Exactly 90 days',
      'Reopened lately',
    ]);
    expect(questionIds).toEqual(new Set([old.id]));
  });
});

describe('the rules in Settings → Review', () => {
  it('each turn their items off', async () => {
    const light = await lessonOn('Light of the world', '2025-10-26');
    await askedOn(light.id, 'Why light?', '2025-10-26');
    const lazarus = await lessonOn('Lazarus', '2026-07-05');
    await askedOn(lazarus.id, 'Why wait two days?', '2026-07-05');
    for (const date of ['2026-01-04', '2026-03-01', '2026-05-03']) {
      await sectionIn((await lessonOn(`On ${date}`, date)).id, citing(ROM_8_28));
    }
    const rules = async () => [...new Set((await backAgain(TODAY, db)).items.map((i) => i.rule))];
    expect(await rules()).toEqual(['year_ago', 'repeated_verse', 'stale_question']);

    await updateSettings(
      { resurfacing: { yearAgo: false, repeatedVerse: true, staleQuestion: true } },
      db,
    );
    // Off, the year-ago lesson's question is stale instead.
    expect(shape((await backAgain(TODAY, db)).items)).toEqual([
      'verse Romans 8:28 (3)',
      'stale Why light? since 2025-10-26',
      'stale Why wait two days? since 2026-07-05',
    ]);
    await updateSettings(
      { resurfacing: { yearAgo: false, repeatedVerse: false, staleQuestion: false } },
      db,
    );
    expect(await backAgain(TODAY, db)).toEqual({ items: [], questionIds: new Set() });
  });
});

describe('dismiss for a year', () => {
  it('hides an item until the same day next year, and Undo brings it back', async () => {
    const light = await lessonOn('Light of the world', '2025-10-26');
    const dismissal = await dismissResurfaced('year_ago', light.id, TODAY, db);
    expect(dismissal.until).toBe('2027-10-21');
    expect((await backAgain(TODAY, db)).items).toEqual([]);

    await undoDismissal(dismissal.id, db);
    expect(shape((await backAgain(TODAY, db)).items)).toEqual(['year Light of the world (1) ']);
  });

  it('keeps a dismissed stale question out of the queue and its count', async () => {
    const lesson = await lessonOn('Lazarus', '2026-07-05');
    const old = await askedOn(lesson.id, 'Why wait two days?', '2026-07-05');
    expect(await reviewCount(TODAY, db)).toEqual({ questions: 1, verses: 0 });

    await dismissResurfaced('stale_question', old.id, TODAY, db);
    const { items, questionIds } = await backAgain(TODAY, db);
    expect(items).toEqual([]);
    expect(questionIds.has(old.id)).toBe(true);
    expect(await reviewCount(TODAY, db)).toEqual({ questions: 0, verses: 0 });
    // A year on it's back.
    expect(await reviewCount('2027-10-21', db)).toEqual({ questions: 1, verses: 0 });
  });
});

describe('compile view visits', () => {
  it('are one per scope per day, the older ones deleted', async () => {
    const romans8 = { book: 'ROM', chapter: 8 } as const;
    const first = await recordVisit(romans8, TODAY, db);
    expect(first).not.toBeNull();
    expect(await recordVisit(romans8, TODAY, db)).toBeNull();
    expect(await recordVisit({ ...romans8, verseStart: 28 }, TODAY, db)).not.toBeNull();

    await db.passageVisit.update(first!.id, { createdAt: at('2026-10-20') });
    const next = await recordVisit(romans8, TODAY, db);
    const visits = await db.passageVisit.toArray();
    expect(visits.filter((v) => v.deletedAt === null).map((v) => v.id)).toEqual(
      expect.arrayContaining([next!.id]),
    );
    expect(visits.find((v) => v.id === first!.id)?.deletedAt).not.toBeNull();
    expect(visits.filter((v) => v.deletedAt === null)).toHaveLength(2);
  });
});
