import {
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
  return {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: question }] },
      { type: 'paragraph' },
    ],
  };
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
    const question = await w.create('question', { lessonId, text });
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

/**
 * "Answer in a section" (wireframes/lessons.md): a top-level section headed with the question,
 * and an answered entry naming it. The question stays open until the section has an answer (its
 * status follows the section's text). A question whose answer section is still there gets that
 * one back instead of a second. Without `at`, the section goes after the lesson's last top-level
 * section.
 */
export function promoteQuestion(
  id: string,
  at?: { id?: string; orderKey: string },
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, async (w) => {
    const question = await liveQuestion(w, id);
    const existing = await answerSectionOf(id, w.db);
    if (existing) return existing;

    const orderKey = at?.orderKey ?? (await endOfLesson(w, question.lessonId));
    const section = await w.create('section', {
      id: at?.id,
      lessonId: question.lessonId,
      parentId: null,
      orderKey,
      body: answerBody(question.text),
      conflictOf: null,
      conflictDevice: null,
    });
    // A parked question being answered is open again until the answer is written.
    await addEntry(w, question, 'answered', { sectionId: section.id });
    return section;
  });
}
