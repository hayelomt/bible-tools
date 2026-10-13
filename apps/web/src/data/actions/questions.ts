import {
  compareOrder,
  keyBetween,
  type Question,
  type Section,
  type SectionBody,
  toPlainText,
} from '@lamp/domain';
import { action, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * Whether an answer section has an answer: text beyond the heading it was given, the question
 * (F5: "answered when the section has a body").
 */
export function hasAnswer(body: SectionBody): boolean {
  const [first, ...rest] = body.content;
  const answer = first?.type === 'heading' ? rest : body.content;
  return toPlainText({ type: 'doc', content: answer }).trim().length > 0;
}

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

/**
 * The status a question's answer gives it: answered while its section is there and has an answer,
 * open otherwise. A parked question stays parked; the user parked it.
 */
async function answeredStatus(w: Writer, question: Question): Promise<Question['status']> {
  if (question.status === 'parked') return 'parked';
  const section = question.answerSectionId
    ? await w.db.section.get(question.answerSectionId)
    : undefined;
  return section && section.deletedAt === null && hasAnswer(section.body) ? 'answered' : 'open';
}

/**
 * Brings the questions answered in `sections` up to date, after those sections were written,
 * deleted or restored. Called inside the section actions, so the status changes in the same
 * transaction as the text.
 */
export async function syncAnswers(w: Writer, sections: readonly Section[]): Promise<void> {
  for (const section of sections) {
    const questions = await w.db.question
      .where('lessonId')
      .equals(section.lessonId)
      .filter((q) => q.deletedAt === null && q.answerSectionId === section.id)
      .toArray();
    for (const question of questions) {
      const status = await answeredStatus(w, question);
      if (status !== question.status) await w.update('question', question.id, { status });
    }
  }
}

export function addQuestion(lessonId: string, text: string, db: LampDb = appDb): Promise<Question> {
  return action(db, (w) =>
    w.create('question', { lessonId, text, status: 'open', answerSectionId: null }),
  );
}

export function updateQuestion(id: string, text: string, db: LampDb = appDb): Promise<Question> {
  return action(db, (w) => w.update('question', id, { text }));
}

/**
 * Parks a question, or reopens a parked one. Reopening gives back the status its answer gives it,
 * so a question parked after it was answered is answered again.
 */
export function setParked(id: string, parked: boolean, db: LampDb = appDb): Promise<Question> {
  return action(db, async (w) => {
    const question = await w.db.question.get(id);
    if (!question || question.deletedAt !== null) throw new RowNotFoundError('question', id);
    const status = parked ? 'parked' : await answeredStatus(w, { ...question, status: 'open' });
    return w.update('question', id, { status });
  });
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
 * linked from it by `answerSectionId`. The question stays open until the section has an answer
 * (`syncAnswers`). A question whose answer section is still there gets that one back instead of a
 * second. Without `at`, the section goes after the lesson's last top-level section.
 */
export function promoteQuestion(
  id: string,
  at?: { id?: string; orderKey: string },
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, async (w) => {
    const question = await w.db.question.get(id);
    if (!question || question.deletedAt !== null) throw new RowNotFoundError('question', id);
    if (question.answerSectionId) {
      const existing = await w.db.section.get(question.answerSectionId);
      if (existing && existing.deletedAt === null) return existing;
    }

    let orderKey = at?.orderKey;
    if (orderKey === undefined) {
      const last = (
        await w.db.section
          .where('lessonId')
          .equals(question.lessonId)
          .filter((s) => s.deletedAt === null && s.parentId === null)
          .toArray()
      )
        .toSorted(compareOrder)
        .at(-1);
      orderKey = keyBetween(last?.orderKey ?? null, null);
    }
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
    await w.update('question', id, { answerSectionId: section.id, status: 'open' });
    return section;
  });
}
