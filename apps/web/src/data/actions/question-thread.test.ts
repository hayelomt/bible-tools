import { type QuestionEntry, threadOf } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LampDb } from '../db.ts';
import { lessonQuestions } from '../queries.ts';
import { questionViews } from '../question-status.ts';
import { lineageSummary, questionChoices, questionThread } from '../question-thread.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, deleteLesson } from './lessons.ts';
import {
  addQuestion,
  answerBody,
  mergeQuestions,
  parkQuestion,
  promoteQuestion,
  removeFromLesson,
  reopenQuestion,
  restoreEntries,
  revisitQuestion,
  splitQuestion,
} from './questions.ts';
import { updateSection } from './sections.ts';

/**
 * Question threads (F24, M10-09 to M10-11): revisits, partial answers, split and merge, and the
 * thread and its summary as the screens read them.
 */

let db: LampDb;
let dbCount = 0;
let shepherd: string;
let lazarus: string;

const lesson = (title: string, date: string) =>
  createLesson(
    {
      seriesId: null,
      title,
      date,
      source: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    },
    db,
  );

beforeEach(async () => {
  db = new LampDb(`question-thread-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  ({ id: shepherd } = await lesson('The Good Shepherd', '2026-03-02'));
  ({ id: lazarus } = await lesson('Lazarus', '2026-04-06'));
});

afterEach(async () => {
  vi.useRealTimers();
  await db.delete();
});

/** Runs the next writes at `iso`, so entries get the dates a thread is read in. */
const at = (iso: string) => vi.useFakeTimers({ now: new Date(iso), toFake: ['Date'] });

const entriesOf = async (questionId: string) =>
  threadOf(await db.questionEntry.where('questionId').equals(questionId).toArray());
const kinds = async (questionId: string) =>
  (await entriesOf(questionId)).map((e) => [e.kind, e.lessonId]);
const viewOf = async (id: string) => (await questionViews([(await db.question.get(id))!], db))[0]!;
const write = (sectionId: string, question: string, text: string) =>
  updateSection(
    sectionId,
    {
      body: {
        type: 'doc',
        content: [
          answerBody(question).content[0]!,
          { type: 'paragraph', content: [{ type: 'text', text }] },
        ],
      },
    },
    db,
  );

describe('revisiting', () => {
  it('adds a revisited entry in the other lesson, which then lists the question too', async () => {
    at('2026-03-02T10:00:00Z');
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    at('2026-04-06T10:00:00Z');
    await revisitQuestion(question.id, lazarus, db);

    expect(await kinds(question.id)).toEqual([
      ['asked', shepherd],
      ['revisited', lazarus],
    ]);
    expect((await lessonQuestions(lazarus, db)).map((q) => [q.text, q.revisited])).toEqual([
      ['Who are the other sheep?', true],
    ]);
    expect((await lessonQuestions(shepherd, db)).map((q) => q.revisited)).toEqual([false]);
    expect(await db.question.count()).toBe(1);
  });

  it('lists a lesson’s questions in the order they came to it', async () => {
    at('2026-03-02T10:00:00Z');
    const old = await addQuestion(shepherd, 'Who are the other sheep?', db);
    at('2026-04-06T09:00:00Z');
    const own = await addQuestion(lazarus, 'Why did Jesus wait?', db);
    at('2026-04-06T10:00:00Z');
    await revisitQuestion(old.id, lazarus, db);
    const later = await addQuestion(lazarus, 'What is the glory of God?', db);
    expect((await lessonQuestions(lazarus, db)).map((q) => q.id)).toEqual([
      own.id,
      old.id,
      later.id,
    ]);
  });

  it('answers in the lesson it was revisited in', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    await revisitQuestion(question.id, lazarus, db);
    const section = await promoteQuestion(question.id, { lessonId: lazarus }, db);
    expect(section.lessonId).toBe(lazarus);
    expect((await entriesOf(question.id)).at(-1)).toMatchObject({
      kind: 'answered',
      lessonId: lazarus,
      sectionId: section.id,
    });
    // Answering again in the same lesson gets the same section back; another lesson gets its own.
    expect((await promoteQuestion(question.id, { lessonId: lazarus }, db)).id).toBe(section.id);
    expect((await promoteQuestion(question.id, {}, db)).lessonId).toBe(shepherd);
  });

  it('is undone from that lesson with “Remove from this lesson”, and back with Undo', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    await revisitQuestion(question.id, lazarus, db);
    await promoteQuestion(question.id, { lessonId: lazarus, partial: true }, db);
    const removed = await removeFromLesson(question.id, lazarus, db);
    expect(removed).toHaveLength(2);
    expect(await lessonQuestions(lazarus, db)).toEqual([]);
    expect(await kinds(question.id)).toEqual([['asked', shepherd]]);

    await restoreEntries(removed, db);
    expect((await lessonQuestions(lazarus, db)).map((q) => q.id)).toEqual([question.id]);
  });

  it('goes with the lesson it was revisited in', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    await revisitQuestion(question.id, lazarus, db);
    await deleteLesson(lazarus, db);
    expect(await kinds(question.id)).toEqual([['asked', shepherd]]);
  });
});

describe('partial answers', () => {
  it('add a section and a partial entry; the question is partly answered and still open', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    const first = await promoteQuestion(question.id, { partial: true }, db);
    const second = await promoteQuestion(question.id, { partial: true }, db);
    expect(second.id).not.toBe(first.id);
    expect(first.body).toEqual(answerBody('Who are the other sheep?'));
    await write(first.id, question.text, 'The Gentiles.');

    const view = await viewOf(question.id);
    expect(view).toMatchObject({ status: 'open', partial: true });
    // A full answer settles it.
    const answer = await promoteQuestion(question.id, {}, db);
    await write(answer.id, question.text, 'One flock.');
    expect(await viewOf(question.id)).toMatchObject({ status: 'answered', partial: false });
  });

  it('reopening an answered question puts it back in Review', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    const answer = await promoteQuestion(question.id, {}, db);
    await write(answer.id, question.text, 'One flock.');
    expect((await viewOf(question.id)).status).toBe('answered');
    await reopenQuestion(question.id, db);
    expect((await viewOf(question.id)).status).toBe('open');
  });
});

/** Every entry by id, and which question holds it. */
const holders = async () =>
  new Map(
    (await db.questionEntry.toArray())
      .filter((e) => e.deletedAt === null)
      .map((e) => [e.id, e.questionId]),
  );

describe('splitQuestion', () => {
  it('moves the chosen entries to a new question, losing and copying none', async () => {
    at('2026-03-02T10:00:00Z');
    const question = await addQuestion(shepherd, 'Who are the other sheep, and why one flock?', db);
    at('2026-04-06T10:00:00Z');
    await revisitQuestion(question.id, lazarus, db);
    at('2026-05-04T10:00:00Z');
    const partial = await promoteQuestion(question.id, { partial: true }, db);
    const before = await entriesOf(question.id);
    const moving = before.filter((e) => e.kind !== 'asked').map((e) => e.id);

    at('2026-10-17T10:00:00Z');
    const split = await splitQuestion(
      question.id,
      { text: 'Who are the other sheep?', newText: 'Why one flock?', moving },
      db,
    );

    const after = await holders();
    expect([...after.keys()].toSorted()).toEqual(before.map((e) => e.id).toSorted());
    expect((await entriesOf(question.id)).map((e) => e.kind)).toEqual(['asked']);
    // The moved entries keep their dates and lessons.
    expect(await entriesOf(split.id)).toEqual(
      before
        .filter((e) => moving.includes(e.id))
        .map((e) => expect.objectContaining({ ...pick(e), questionId: split.id })),
    );
    expect(split).toMatchObject({
      lessonId: shepherd,
      text: 'Why one flock?',
      splitFromId: question.id,
    });
    expect((await db.question.get(question.id))!.text).toBe('Who are the other sheep?');
    expect((await entriesOf(split.id)).find((e) => e.kind === 'partial')!.sectionId).toBe(
      partial.id,
    );
  });

  it('gives a question left with no entries an asked one, so no thread is empty', async () => {
    const question = await addQuestion(shepherd, 'Two questions', db);
    const [asked] = await entriesOf(question.id);

    const all = await splitQuestion(
      question.id,
      { text: 'One', newText: 'Two', moving: [asked!.id] },
      db,
    );
    expect((await entriesOf(all.id)).map((e) => e.id)).toEqual([asked!.id]);
    expect((await entriesOf(question.id)).map((e) => e.kind)).toEqual(['asked']);

    const none = await splitQuestion(
      question.id,
      { text: 'One', newText: 'Three', moving: [] },
      db,
    );
    expect((await entriesOf(none.id)).map((e) => [e.kind, e.lessonId])).toEqual([
      ['asked', shepherd],
    ]);
    expect(await entriesOf(question.id)).toHaveLength(1);
  });
});

describe('mergeQuestions', () => {
  it('moves every entry onto the other question, in date order, and deletes the first', async () => {
    at('2026-03-02T10:00:00Z');
    const into = await addQuestion(shepherd, 'One flock, one shepherd?', db);
    at('2026-04-06T10:00:00Z');
    const from = await addQuestion(lazarus, 'Who are the other sheep?', db);
    at('2026-05-04T10:00:00Z');
    await parkQuestion(into.id, db);
    at('2026-06-01T10:00:00Z');
    await promoteQuestion(from.id, { partial: true }, db);
    const before = await holders();

    await mergeQuestions(from.id, into.id, db);

    const after = await holders();
    expect([...after.keys()].toSorted()).toEqual([...before.keys()].toSorted());
    expect(new Set(after.values())).toEqual(new Set([into.id]));
    expect((await entriesOf(into.id)).map((e) => [e.kind, e.lessonId])).toEqual([
      ['asked', shepherd],
      ['asked', lazarus],
      ['parked', shepherd],
      ['partial', lazarus],
    ]);
    expect((await db.question.get(from.id))!.deletedAt).not.toBeNull();
    // The merged question shows in both lessons.
    expect((await lessonQuestions(lazarus, db)).map((q) => [q.id, q.revisited])).toEqual([
      [into.id, true],
    ]);
  });

  it('refuses to merge a question into itself', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    expect(() => mergeQuestions(question.id, question.id, db)).toThrow('merged into itself');
  });
});

describe('questionThread', () => {
  it('reads each entry with its lesson and its answer’s first words', async () => {
    at('2026-03-02T10:00:00Z');
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    at('2026-04-06T10:00:00Z');
    await revisitQuestion(question.id, lazarus, db);
    const partial = await promoteQuestion(question.id, { lessonId: lazarus, partial: true }, db);
    await write(partial.id, question.text, 'Gentiles, brought into one flock with Israel.');

    const thread = (await questionThread(question.id, db))!;
    expect(thread.question.partial).toBe(true);
    expect(thread.splitFrom).toBeNull();
    expect(
      thread.entries.map((e) => [e.entry.kind, e.lesson?.title, e.section?.words ?? null]),
    ).toEqual([
      ['asked', 'The Good Shepherd', null],
      ['revisited', 'Lazarus', null],
      ['partial', 'Lazarus', '“Gentiles, brought into one flock with…”'],
    ]);
    expect(thread.answerLesson?.id).toBe(lazarus);
  });

  it('names the question it was split from, and is null for a deleted question', async () => {
    const question = await addQuestion(shepherd, 'Two questions', db);
    const split = await splitQuestion(question.id, { text: 'One', newText: 'Two', moving: [] }, db);
    expect((await questionThread(split.id, db))!.splitFrom?.text).toBe('One');
    await mergeQuestions(split.id, question.id, db);
    expect(await questionThread(split.id, db)).toBeNull();
    expect(await questionThread('0199e0a0-0000-7000-8000-000000000000', db)).toBeNull();
  });

  it('answers in the question’s own lesson once the latest entry’s lesson is gone', async () => {
    const question = await addQuestion(shepherd, 'Who are the other sheep?', db);
    await revisitQuestion(question.id, lazarus, db);
    await db.lesson.update(lazarus, { deletedAt: '2026-10-17T00:00:00.000Z' });
    expect((await questionThread(question.id, db))!.answerLesson?.id).toBe(shepherd);
  });
});

describe('questionChoices', () => {
  it('lists live questions in live lessons, newest first, with their status', async () => {
    at('2026-03-02T10:00:00Z');
    const old = await addQuestion(shepherd, 'Who are the other sheep?', db);
    at('2026-04-06T10:00:00Z');
    const parked = await addQuestion(lazarus, 'Why did Jesus wait?', db);
    await parkQuestion(parked.id, db);
    expect(
      (await questionChoices(db)).map((c) => [c.question.id, c.question.status, c.lesson.id]),
    ).toEqual([
      [parked.id, 'parked', lazarus],
      [old.id, 'open', shepherd],
    ]);
  });
});

/** An entry of a thread made up for its summary. */
const lineageEntry = (
  kind: QuestionEntry['kind'],
  createdAt: string,
  n: number,
): QuestionEntry => ({
  id: `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`,
  questionId: '0199e0a0-0000-7000-8000-000000000100',
  lessonId: '0199e0a0-0000-7000-8000-000000000200',
  kind,
  sectionId: null,
  createdAt,
  updatedAt: createdAt,
  rev: 0,
  deletedAt: null,
});

describe('lineageSummary', () => {
  const NOW = new Date('2026-10-17T12:00:00Z');

  it('matches the thread: each time asked or revisited, since its first month, and partials', () => {
    const thread = [
      lineageEntry('asked', '2026-03-02T10:00:00.000Z', 1),
      lineageEntry('revisited', '2026-04-06T10:00:00.000Z', 2),
      lineageEntry('partial', '2026-05-04T10:00:00.000Z', 3),
      lineageEntry('revisited', '2026-10-12T10:00:00.000Z', 4),
    ];
    expect(lineageSummary(thread, NOW)).toBe('Asked 3 times since March · 1 partial answer');
    expect(lineageSummary(thread.slice(0, 2), NOW)).toBe('Asked 2 times since March');
    expect(lineageSummary([thread[0]!, thread[2]!], NOW)).toBe('Asked in March · 1 partial answer');
  });

  it('adds the year when the thread started in another, and says nothing for one ask', () => {
    const thread = [
      lineageEntry('asked', '2025-11-02T10:00:00.000Z', 1),
      lineageEntry('revisited', '2026-04-06T10:00:00.000Z', 2),
    ];
    expect(lineageSummary(thread, NOW)).toBe('Asked 2 times since November 2025');
    expect(lineageSummary(thread.slice(0, 1), NOW)).toBeNull();
    expect(lineageSummary([], NOW)).toBeNull();
  });
});

const pick = (e: QuestionEntry) => ({
  id: e.id,
  kind: e.kind,
  lessonId: e.lessonId,
  sectionId: e.sectionId,
  createdAt: e.createdAt,
});
