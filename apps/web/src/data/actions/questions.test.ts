import { emptyBody, keyBetween, newId, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { lessonQuestions, lessonSections, lessonTakeaways } from '../queries.ts';
import { questionViews } from '../question-status.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, deleteLesson } from './lessons.ts';
import {
  addQuestion,
  answerBody,
  hasAnswer,
  parkQuestion,
  promoteQuestion,
  removeQuestion,
  reopenQuestion,
  restoreQuestion,
  undoEntry,
  updateQuestion,
} from './questions.ts';
import { createSection, removeSection, restoreSections, updateSection } from './sections.ts';
import { createTakeaway, removeTakeaway, restoreTakeaway, updateTakeaway } from './takeaways.ts';

let db: LampDb;
let dbCount = 0;
let lessonId: string;

beforeEach(async () => {
  db = new LampDb(`questions-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
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

/** The answer section's body with `text` written under the heading. */
const answered = (question: string, text: string): SectionBody => ({
  type: 'doc',
  content: [
    answerBody(question).content[0]!,
    { type: 'paragraph', content: [{ type: 'text', text }] },
  ],
});

const viewOf = async (id: string) => (await questionViews([(await db.question.get(id))!], db))[0]!;
const statusOf = async (id: string) => (await viewOf(id)).status;
const kinds = async (id: string) => (await viewOf(id)).entries.map((e) => e.kind);

describe('takeaways', () => {
  it('are added, edited and deleted, with createdAt for the review queue, and Undo', async () => {
    const takeaway = await createTakeaway({ lessonId, text: 'He knows his sheep.' }, db);
    expect(takeaway.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    await createTakeaway({ lessonId, text: 'The door is narrow.' }, db);
    await updateTakeaway(takeaway.id, 'He knows his sheep by name.', db);
    expect((await lessonTakeaways(lessonId, db)).map((t) => t.text)).toEqual([
      'He knows his sheep by name.',
      'The door is narrow.',
    ]);

    await removeTakeaway(takeaway.id, db);
    expect(await lessonTakeaways(lessonId, db)).toHaveLength(1);
    await restoreTakeaway(takeaway.id, db);
    expect((await lessonTakeaways(lessonId, db))[0]?.id).toBe(takeaway.id);
    expect((await db.outbox.toArray()).map((c) => `${c.entity} ${c.op}`)).toEqual([
      'takeaway upsert',
      'takeaway upsert',
      'takeaway upsert',
      'takeaway delete',
      'takeaway upsert',
    ]);
  });

  it('refuses an empty one', async () => {
    await expect(createTakeaway({ lessonId, text: '  ' }, db)).rejects.toThrow(/Too small/);
    expect(await lessonTakeaways(lessonId, db)).toEqual([]);
  });
});

describe('questions', () => {
  it('are added open, edited, parked, reopened and deleted with Undo', async () => {
    const question = await addQuestion(lessonId, 'Who are the other sheep?', db);
    expect(await viewOf(question.id)).toMatchObject({ status: 'open', answerSectionId: null });
    expect(await kinds(question.id)).toEqual(['asked']);
    await updateQuestion(question.id, 'Who are the “other sheep”?', db);
    await parkQuestion(question.id, db);
    expect(await statusOf(question.id)).toBe('parked');
    await reopenQuestion(question.id, db);
    expect(await statusOf(question.id)).toBe('open');
    expect(await kinds(question.id)).toEqual(['asked', 'parked', 'reopened']);
    // Each is an entry, queued like any row, in the lesson it happened in.
    const entries = (await db.outbox.toArray()).filter((c) => c.entity === 'questionEntry');
    expect(entries.map((c) => c.op === 'upsert' && c.row)).toMatchObject([
      { kind: 'asked', lessonId, questionId: question.id, sectionId: null },
      { kind: 'parked', lessonId },
      { kind: 'reopened', lessonId },
    ]);

    // Undo of Park takes its entry back out.
    const parked = await parkQuestion(question.id, db);
    await undoEntry(parked.id, db);
    expect(await statusOf(question.id)).toBe('open');
    expect(await kinds(question.id)).toEqual(['asked', 'parked', 'reopened']);

    await removeQuestion(question.id, db);
    expect(await lessonQuestions(lessonId, db)).toEqual([]);
    await restoreQuestion(question.id, db);
    expect((await lessonQuestions(lessonId, db)).map((q) => q.text)).toEqual([
      'Who are the “other sheep”?',
    ]);
  });

  it('promotion makes a top-level section headed with the question and links it', async () => {
    const first = await createSection(
      {
        lessonId,
        parentId: null,
        orderKey: keyBetween(null, null),
        body: emptyBody(),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const question = await addQuestion(lessonId, 'What is the door?', db);
    const section = await promoteQuestion(question.id, undefined, db);

    expect(section).toMatchObject({
      lessonId,
      parentId: null,
      body: answerBody('What is the door?'),
    });
    expect(section.orderKey > first.orderKey).toBe(true);
    expect(await viewOf(question.id)).toMatchObject({
      answerSectionId: section.id,
      status: 'open',
    });
    expect((await viewOf(question.id)).entries.at(-1)).toMatchObject({
      kind: 'answered',
      sectionId: section.id,
    });
    // Promoting again goes back to the same section.
    expect((await promoteQuestion(question.id, undefined, db)).id).toBe(section.id);
    expect(await lessonSections(lessonId, db)).toHaveLength(2);
  });

  it('takes the id and place the list gives the section', async () => {
    const question = await addQuestion(lessonId, 'What is the door?', db);
    const id = newId();
    const section = await promoteQuestion(question.id, { id, orderKey: 'a5' }, db);
    expect(section).toMatchObject({ id, orderKey: 'a5' });
  });

  it('an empty answer section leaves the question open; text answers it; emptying reopens it', async () => {
    const question = await addQuestion(lessonId, 'What is the door?', db);
    const section = await promoteQuestion(question.id, undefined, db);

    // Only the heading, or a heading edited: still no answer.
    await updateSection(section.id, { body: answerBody('What is the door, really?') }, db);
    expect(await statusOf(question.id)).toBe('open');

    await updateSection(section.id, { body: answered('What is the door?', 'Jesus himself.') }, db);
    expect(await statusOf(question.id)).toBe('answered');

    await updateSection(section.id, { body: answerBody('What is the door?') }, db);
    expect(await statusOf(question.id)).toBe('open');
  });

  it('deleting the answer section reopens the question, and Undo answers it again', async () => {
    const question = await addQuestion(lessonId, 'What is the door?', db);
    const section = await promoteQuestion(question.id, undefined, db);
    await updateSection(section.id, { body: answered('What is the door?', 'Jesus.') }, db);

    const removed = await removeSection(section.id, {}, db);
    expect(await statusOf(question.id)).toBe('open');
    await restoreSections(removed, db);
    expect(await statusOf(question.id)).toBe('answered');

    // A new answer section replaces one that's gone.
    await removeSection(section.id, {}, db);
    const next = await promoteQuestion(question.id, undefined, db);
    expect(next.id).not.toBe(section.id);
  });

  it('a parked question stays parked while its answer is written, and reopens as answered', async () => {
    const question = await addQuestion(lessonId, 'What is the door?', db);
    const section = await promoteQuestion(question.id, undefined, db);
    await parkQuestion(question.id, db);
    await updateSection(section.id, { body: answered('What is the door?', 'Jesus.') }, db);
    expect(await statusOf(question.id)).toBe('parked');
    await reopenQuestion(question.id, db);
    expect(await statusOf(question.id)).toBe('answered');
    expect(await kinds(question.id)).toEqual(['asked', 'answered', 'parked', 'answered']);

    // Reopening an answered question puts it back in Review.
    await reopenQuestion(question.id, db);
    expect(await statusOf(question.id)).toBe('open');
    expect(await kinds(question.id)).toEqual([
      'asked',
      'answered',
      'parked',
      'answered',
      'reopened',
    ]);
  });

  it('promoting a parked question opens it', async () => {
    const question = await addQuestion(lessonId, 'What is the door?', db);
    await parkQuestion(question.id, db);
    await promoteQuestion(question.id, undefined, db);
    expect(await statusOf(question.id)).toBe('open');
  });

  it('a lesson delete takes its takeaways and questions with it, and the entries made in it', async () => {
    await createTakeaway({ lessonId, text: 'He knows his sheep.' }, db);
    await addQuestion(lessonId, 'What is the door?', db);
    await deleteLesson(lessonId, db);
    expect(await lessonTakeaways(lessonId, db)).toEqual([]);
    expect(await lessonQuestions(lessonId, db)).toEqual([]);
    expect(await db.questionEntry.filter((e) => e.deletedAt === null).count()).toBe(0);
  });
});

describe('hasAnswer', () => {
  it('counts text below the heading, or any text when there is no heading', () => {
    expect(hasAnswer(answerBody('Why?'))).toBe(false);
    expect(hasAnswer(answered('Why?', 'Because.'))).toBe(true);
    expect(hasAnswer(emptyBody())).toBe(false);
    expect(
      hasAnswer({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Yes.' }] }],
      }),
    ).toBe(true);
  });
});
