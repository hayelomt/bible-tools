import {
  headedBody,
  type Question,
  type QuestionEntry,
  type QuestionEntryKind,
  type Section,
  type SectionBody,
  threadOf,
} from '@lamp/domain';
import { action, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import { answerSectionOf, hasAnswer } from '../question-status.ts';
import { endOfLesson } from './section-order.ts';

export { hasAnswer };

/** A new answer section's body: the question as its heading, and an empty line to write in. */
export function answerBody(question: string): SectionBody {
  return headedBody(question);
}

async function liveQuestion(w: Writer, id: string): Promise<Question> {
  const question = await w.db.question.get(id);
  if (!question || question.deletedAt !== null) throw new RowNotFoundError('question', id);
  return question;
}

/**
 * Adds an entry to a question's thread (F24, §17.5), in its own lesson unless `lessonId` says
 * otherwise. The latest entry gives the question its status.
 */
function addEntry(
  w: Writer,
  question: Question,
  kind: QuestionEntryKind,
  {
    sectionId = null,
    lessonId = question.lessonId,
  }: { sectionId?: string | null; lessonId?: string } = {},
): Promise<QuestionEntry> {
  return w.create('questionEntry', { questionId: question.id, lessonId, kind, sectionId });
}

/** A new question, and its thread's first entry: asked, in this lesson. */
export function addQuestion(lessonId: string, text: string, db: LampDb = appDb): Promise<Question> {
  return action(db, async (w) => {
    const question = await w.create('question', { lessonId, text, splitFromId: null });
    await addEntry(w, question, 'asked');
    return question;
  });
}

export function updateQuestion(id: string, text: string, db: LampDb = appDb): Promise<Question> {
  return action(db, (w) => w.update('question', id, { text }));
}

/** Parks a question: a parked entry, which Undo takes back out (`undoEntry`). */
export function parkQuestion(id: string, db: LampDb = appDb): Promise<QuestionEntry> {
  return action(db, async (w) => addEntry(w, await liveQuestion(w, id), 'parked'));
}

/**
 * Reopens a question. A parked one gets back what it had before it was parked: answered again in
 * the same section, if that's where it was, and reopened otherwise. An answered one is reopened,
 * and back in Review.
 */
export function reopenQuestion(id: string, db: LampDb = appDb): Promise<QuestionEntry> {
  return action(db, async (w) => {
    const question = await liveQuestion(w, id);
    const thread = threadOf(await w.db.questionEntry.where('questionId').equals(id).toArray());
    if (thread.at(-1)?.kind !== 'parked') return addEntry(w, question, 'reopened');
    const before = thread.findLast((e) => e.kind !== 'parked');
    const answer = before?.kind === 'answered' && before.sectionId ? before.sectionId : null;
    const section = answer ? await w.db.section.get(answer) : undefined;
    return section && section.deletedAt === null
      ? addEntry(w, question, 'answered', { sectionId: section.id })
      : addEntry(w, question, 'reopened');
  });
}

/** Undo of an entry just added (Park): the thread is as it was before it. */
export function undoEntry(entryId: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('questionEntry', entryId));
}

/** Deletes at once; the list offers Undo. Its answer section stays: it's a note of its own. */
export function removeQuestion(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('question', id));
}

export function restoreQuestion(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('question', id));
}

/** Where "Answer in a section" puts its section, and what kind of answer it is. */
export interface PromoteOptions {
  /** The new section's id and place; without them, after the lesson's last top-level section. */
  id?: string;
  orderKey?: string;
  /** The lesson it's answered in: the question's own, or one it was revisited in. */
  lessonId?: string;
  /** "Add a partial answer" (F24): a partial entry, and always a new section. */
  partial?: boolean;
}

/**
 * "Answer in a section" (wireframes/lessons.md): a top-level section headed with the question,
 * and an answered entry naming it. The question stays open until the section has an answer (its
 * status follows the section's text). A question whose answer section is still there, in the same
 * lesson, gets that one back instead of a second. "Add a partial answer" (wireframes/thinking.md)
 * makes a section the same way, with a partial entry.
 */
export function promoteQuestion(
  id: string,
  { id: sectionId, orderKey, lessonId, partial = false }: PromoteOptions = {},
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, async (w) => {
    const question = await liveQuestion(w, id);
    const lesson = lessonId ?? question.lessonId;
    if (!partial) {
      const existing = await answerSectionOf(id, w.db);
      if (existing?.lessonId === lesson) return existing;
    }

    const section = await w.create('section', {
      id: sectionId,
      lessonId: lesson,
      parentId: null,
      orderKey: orderKey ?? (await endOfLesson(w, lesson)),
      body: answerBody(question.text),
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    });
    // A parked question being answered is open again until the answer is written.
    await addEntry(w, question, partial ? 'partial' : 'answered', {
      sectionId: section.id,
      lessonId: lesson,
    });
    return section;
  });
}

/**
 * "Revisit a question…" (F24): a revisited entry in this lesson rather than a copy, so the
 * question shows here as well as in its own lesson.
 */
export function revisitQuestion(
  id: string,
  lessonId: string,
  db: LampDb = appDb,
): Promise<QuestionEntry> {
  return action(db, async (w) => addEntry(w, await liveQuestion(w, id), 'revisited', { lessonId }));
}

/**
 * "Remove from this lesson", on a question revisited here: its entries made in this lesson go, so
 * it no longer shows here. Returns them, for Undo (`restoreEntries`).
 */
export function removeFromLesson(
  id: string,
  lessonId: string,
  db: LampDb = appDb,
): Promise<string[]> {
  return action(db, async (w) => {
    const entries = await w.db.questionEntry
      .where('questionId')
      .equals(id)
      .filter((e) => e.lessonId === lessonId && e.deletedAt === null)
      .primaryKeys();
    for (const entryId of entries) await w.remove('questionEntry', entryId);
    return entries;
  });
}

export function restoreEntries(ids: readonly string[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const entryId of ids) await w.restore('questionEntry', entryId);
  });
}

/** What Split keeps: the two questions' text, and the entries that go to the second. */
export interface SplitPlan {
  text: string;
  newText: string;
  /** Entries of the question that move to the new one; the rest stay. */
  moving: readonly string[];
}

/**
 * Splits a question in two (F24, M10-10): a new question in the same lesson, split from this one,
 * takes the chosen entries, which keep their dates and lessons. Nothing is copied. A question left
 * with no entries gets an asked entry, so no thread is ever empty.
 */
export function splitQuestion(
  id: string,
  { text, newText, moving }: SplitPlan,
  db: LampDb = appDb,
): Promise<Question> {
  return action(db, async (w) => {
    const question = await liveQuestion(w, id);
    if (text !== question.text) await w.update('question', id, { text });
    const thread = threadOf(await w.db.questionEntry.where('questionId').equals(id).toArray());
    const moved = new Set(moving);
    const split = await w.create('question', {
      lessonId: question.lessonId,
      text: newText,
      splitFromId: id,
    });
    for (const entry of thread) {
      if (moved.has(entry.id)) await w.update('questionEntry', entry.id, { questionId: split.id });
    }
    if (!thread.some((e) => moved.has(e.id))) await addEntry(w, split, 'asked');
    if (thread.every((e) => moved.has(e.id))) await addEntry(w, question, 'asked');
    return split;
  });
}

/**
 * Merges a question into another (F24, M10-10): its entries move to the other, keeping their
 * dates and lessons, so the two threads read as one in date order; then it's deleted.
 */
export function mergeQuestions(fromId: string, intoId: string, db: LampDb = appDb): Promise<void> {
  if (fromId === intoId) throw new Error('A question can’t be merged into itself');
  return action(db, async (w) => {
    await liveQuestion(w, fromId);
    await liveQuestion(w, intoId);
    const entries = await w.db.questionEntry
      .where('questionId')
      .equals(fromId)
      .filter((e) => e.deletedAt === null)
      .primaryKeys();
    for (const entryId of entries) {
      await w.update('questionEntry', entryId, { questionId: intoId });
    }
    await w.remove('question', fromId);
  });
}
