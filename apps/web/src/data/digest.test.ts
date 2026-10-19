import {
  formatPassage,
  keyBetween,
  type Passage,
  type SectionBody,
  toPlainText,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { action } from './action.ts';
import { createLesson, deleteLesson } from './actions/lessons.ts';
import { gradeMemoryItem, memorise } from './actions/memory.ts';
import { addQuestion, parkQuestion } from './actions/questions.ts';
import { createSection } from './actions/sections.ts';
import { createSeries } from './actions/series.ts';
import { addTag } from './actions/tags.ts';
import { LampDb } from './db.ts';
import { digestFor, digestSections } from './digest.ts';
import { ensureDevice } from './setup.ts';

let db: LampDb;
let dbCount = 0;

/** The device's clock: what's written now is written on `day`. */
const on = (day: string) => vi.setSystemTime(new Date(`${day}T12:00:00`));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  on('2026-06-15');
  db = new LampDb(`digest-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

const ref = (p: Passage) => ({ ...p, display: formatPassage(p) });
const citing = (words: string, p?: Passage): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: words },
        ...(p ? [{ type: 'verse' as const, attrs: ref(p) }] : []),
      ],
    },
  ],
});

const lessonOn = (title: string, date: string, seriesId: string | null = null) =>
  createLesson(
    {
      seriesId,
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
async function note(lessonId: string, body: SectionBody, ...tags: string[]) {
  order = keyBetween(order, null);
  const section = await createSection(
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
  for (const tag of tags) await addTag({ kind: 'section', id: section.id }, tag, db);
  return section;
}

/** Answers a question in a section of its lesson, today. */
async function answer(questionId: string, lessonId: string) {
  const section = await note(lessonId, citing('Answered.'));
  await action(db, (w) =>
    w.create('questionEntry', { questionId, lessonId, kind: 'answered', sectionId: section.id }),
  );
}

const JHN = (chapter: number, verseStart: number): Passage => ({
  book: 'JHN',
  chapter,
  verseStart,
});

/** July–September 2026: four lessons, three in John, with a lesson either side and one deleted. */
async function quarter() {
  const june = await lessonOn('Before', '2026-06-28');
  await addQuestion(june.id, 'Still open from June', db);
  const juneAnswered = await addQuestion(june.id, 'Answered in August', db);
  const verse = await memorise(ref({ book: 'ROM', chapter: 8, verseStart: 28 }), '2026-06-15', db);

  on('2026-07-10');
  const john = await createSeries({ title: 'John', description: '', kind: 'book_study' }, db);
  const word = await lessonOn('The Word', '2026-07-05', john.id);
  await note(word.id, citing('In the beginning ', JHN(1, 1)), 'grace');
  const born = await lessonOn('Born again', '2026-08-02', john.id);
  await note(born.id, citing('So loved ', JHN(3, 16)), 'grace', 'hope');
  const psalm = await lessonOn('Psalm 23', '2026-08-16');
  await addTag({ kind: 'lesson', id: psalm.id }, 'grace', db);
  await note(psalm.id, citing('My shepherd ', { book: 'PSA', chapter: 23, verseStart: 1 }));
  const shepherd = await lessonOn('The Good Shepherd', '2026-09-27', john.id);
  await note(shepherd.id, citing('The good shepherd ', JHN(10, 11)), 'grace');
  await note(shepherd.id, citing('The door ', JHN(10, 9)));
  const after = await lessonOn('After', '2026-10-04');
  await note(after.id, citing('Later ', JHN(10, 1)), 'grace', 'peace');
  const gone = await lessonOn('Deleted', '2026-08-09', john.id);
  await note(gone.id, citing('Gone ', JHN(10, 2)), 'peace');
  await deleteLesson(gone.id, db);

  const asked = await addQuestion(word.id, 'Who is the Word?', db);
  await addQuestion(born.id, 'What is new birth?', db);
  const thief = await addQuestion(shepherd.id, 'Thief or hired hand?', db);
  await parkQuestion(thief.id, db);
  const late = await addQuestion(psalm.id, 'Answered in October', db);
  on('2026-07-20');
  await gradeMemoryItem(verse.item.id, 'good', '2026-07-20', db);
  on('2026-08-01');
  await memorise(ref(JHN(3, 16)), '2026-08-01', db);
  on('2026-08-05');
  const reviewedLater = await memorise(ref(JHN(10, 11)), '2026-08-05', db);
  on('2026-08-20');
  await answer(asked.id, word.id);
  await answer(juneAnswered.id, june.id);

  on('2026-10-02');
  await answer(late.id, psalm.id);
  await gradeMemoryItem(reviewedLater.item.id, 'good', '2026-10-02', db);
}

describe('the digest of a quarter (M12-07)', () => {
  it('gives what the fixture quarter held', async () => {
    await quarter();
    const digest = (await digestFor('2026-Q3', db))!;
    expect(digest.title).toBe('July–September 2026');
    expect(digest.lessons.map((l) => l.title)).toEqual([
      'The Word',
      'Born again',
      'Psalm 23',
      'The Good Shepherd',
    ]);
    expect(digest.bySeries.map((s) => [s.series?.title ?? null, s.lessons])).toEqual([
      ['John', 3],
      [null, 1],
    ]);
    expect(digest.topTags).toEqual([
      { name: 'grace', count: 4 },
      { name: 'hope', count: 1 },
    ]);
    // Answered in August, from this quarter and the last; not the one answered in October.
    expect(digest.answered).toBe(2);
    expect(digest.open.map((o) => [o.question.text, o.lesson.title])).toEqual([
      ['What is new birth?', 'Born again'],
    ]);
    // Two added in August; one reviewed in July (added in June); one reviewed since.
    expect(digest.memory).toEqual({ added: 2, reviewed: 1 });
    expect(digest.grew).toEqual([
      { passage: { book: 'JHN', chapter: 10 }, sections: 2 },
      { passage: { book: 'PSA', chapter: 23 }, sections: 1 },
      { passage: { book: 'JHN', chapter: 1 }, sections: 1 },
    ]);

    expect(digestSections(digest).map(toPlainText)).toEqual([
      [
        'Lessons and series',
        '4 lessons: 3 in John, 1 on its own.',
        'Sun 5 Jul · The Word',
        'Sun 2 Aug · Born again',
        'Sun 16 Aug · Psalm 23',
        'Sun 27 Sept · The Good Shepherd',
      ].join('\n'),
      'Top tags\n#grace 4 · #hope 1',
      'Questions\n2 answered, 1 still open.\nWhat is new birth? · Born again',
      'Memory verses\n2 added, 1 reviewed.',
      'Commentaries that grew\nJohn 10 (+2) · Psalm 23 (+1) · John 1 (+1)',
    ]);
    // Each chapter links to its commentary, not a chip that would preview the whole chapter.
    const grew = digestSections(digest, 'https://lamp.test').at(-1)!.content.at(-1)!;
    expect(grew.type).toBe('paragraph');
    expect('content' in grew && grew.content?.slice(0, 4)).toMatchObject([
      {
        text: 'John 10',
        marks: [{ type: 'link', attrs: { href: 'https://lamp.test/compile/JHN.10' } }],
      },
      { text: ' (+2)' },
      { text: ' · ' },
      { text: 'Psalm 23', marks: [{ attrs: { href: 'https://lamp.test/compile/PSA.23' } }] },
    ]);
  });

  it('is none for a quarter without lessons, and plain for one with little in it', async () => {
    await quarter();
    expect(await digestFor('2026-Q1', db)).toBeNull();
    const june = (await digestFor('2026-Q2', db))!;
    expect(digestSections(june).map(toPlainText)).toEqual([
      'Lessons and series\n1 lesson.\nSun 28 Jun · Before',
      'Top tags\nNo tags.',
      'Questions\n0 answered, 1 still open.\nStill open from June · Before',
      'Memory verses\n1 added, 0 reviewed.',
      'Commentaries that grew\nNo verses cited.',
    ]);
  });
});
