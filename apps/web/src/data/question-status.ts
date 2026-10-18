import {
  latestEntry,
  type Question,
  type QuestionEntry,
  type Section,
  threadOf,
} from '@lamp/domain';
import { db as appDb, type LampDb } from './db.ts';
import { type QuestionView, type StatusRows, viewOf } from './question-view.ts';

export { answerPart, hasAnswer, type QuestionView, viewOf } from './question-view.ts';

/** The latest live answer section a question's entries name, for "Answer in a section". */
export async function answerSectionOf(
  questionId: string,
  db: LampDb = appDb,
): Promise<Section | undefined> {
  const entries = await db.questionEntry.where('questionId').equals(questionId).toArray();
  for (const entry of threadOf(entries).toReversed()) {
    if (entry.kind !== 'answered' || !entry.sectionId) continue;
    const section = await db.section.get(entry.sectionId);
    if (section && section.deletedAt === null) return section;
  }
  return undefined;
}

/** The entries of these questions, and the live sections they name. */
export async function statusRows(
  questionIds: readonly string[],
  db: LampDb = appDb,
): Promise<StatusRows> {
  const entries = await db.questionEntry.where('questionId').anyOf(questionIds).toArray();
  const sectionIds = [...new Set(entries.flatMap((e) => (e.sectionId ? [e.sectionId] : [])))];
  const found = await db.section.bulkGet(sectionIds);
  const sections = new Map(
    found.flatMap((s) => (s && s.deletedAt === null ? [[s.id, s] as const] : [])),
  );
  return { entries, sections };
}

/** Questions with their status and answer, in the order given. */
export async function questionViews(
  questions: readonly Question[],
  db: LampDb = appDb,
): Promise<QuestionView[]> {
  const rows = await statusRows(
    questions.map((q) => q.id),
    db,
  );
  return questions.map((question) => viewOf(question, rows));
}

/** The latest entry of a question, which decides its status. */
export async function latestOf(
  questionId: string,
  db: LampDb = appDb,
): Promise<QuestionEntry | undefined> {
  return latestEntry(await db.questionEntry.where('questionId').equals(questionId).toArray());
}
