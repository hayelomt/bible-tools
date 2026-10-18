import {
  type Lesson,
  lineageOf,
  type Question,
  type QuestionEntry,
  type Section,
  threadOf,
  toPlainText,
} from '@lamp/domain';
import { count } from '@/lib/labels.ts';
import { monthLabel, today } from '@/lib/dates.ts';
import { db as appDb, type LampDb } from './db.ts';
import { firstWords } from './links.ts';
import { answerPart, type QuestionView, questionViews } from './question-status.ts';

/**
 * A question's thread page (F24, wireframes/thinking.md "Question thread"): every entry in date
 * order, each with the lesson it happened in and, for an answer, its section.
 */

export interface ThreadEntry {
  entry: QuestionEntry;
  /** Its lesson, or null once that lesson is gone from this device. */
  lesson: Lesson | null;
  /** A partial or full answer's section while it's there, and its first words below the heading. */
  section: { id: string; words: string | null } | null;
}

export interface QuestionThread {
  question: QuestionView;
  /** The question it was split from, deleted or not: "Split from … on …". */
  splitFrom: Question | null;
  entries: ThreadEntry[];
  /** Where Answer adds its section: the latest entry's lesson, or the question's own. */
  answerLesson: Lesson | null;
}

/** A question's thread, or null when it isn't on this device or was deleted. */
export async function questionThread(
  id: string,
  db: LampDb = appDb,
): Promise<QuestionThread | null> {
  const question = await db.question.get(id);
  if (!question || question.deletedAt !== null) return null;
  const [view] = await questionViews([question], db);
  const entries = threadOf(await db.questionEntry.where('questionId').equals(id).toArray());
  const lessons = await liveRows(db.lesson, [question.lessonId, ...entries.map((e) => e.lessonId)]);
  const sections = await liveRows(
    db.section,
    entries.flatMap((e) => (e.sectionId ? [e.sectionId] : [])),
  );
  const splitFrom = question.splitFromId
    ? ((await db.question.get(question.splitFromId)) ?? null)
    : null;
  const latest = entries.findLast((e) => lessons.has(e.lessonId));
  return {
    question: view!,
    splitFrom,
    entries: entries.map((entry) => ({
      entry,
      lesson: lessons.get(entry.lessonId) ?? null,
      section: sectionOf(entry.sectionId ? sections.get(entry.sectionId) : undefined),
    })),
    answerLesson: lessons.get(latest?.lessonId ?? question.lessonId) ?? null,
  };
}

function sectionOf(section: Section | undefined): ThreadEntry['section'] {
  if (!section) return null;
  const body = answerPart(section.body);
  return { id: section.id, words: toPlainText(body).trim() ? firstWords({ body }) : null };
}

async function liveRows<T extends { id: string; deletedAt: string | null }>(
  table: { bulkGet(ids: string[]): Promise<(T | undefined)[]> },
  ids: readonly string[],
): Promise<Map<string, T>> {
  const rows = await table.bulkGet([...new Set(ids)]);
  return new Map(rows.flatMap((row) => (row && row.deletedAt === null ? [[row.id, row]] : [])));
}

/** A question to pick (Revisit, Merge with…), with its own lesson. */
export interface QuestionChoice {
  question: QuestionView;
  lesson: Lesson;
}

/** Every live question in a live lesson, newest first, with its status. */
export async function questionChoices(db: LampDb = appDb): Promise<QuestionChoice[]> {
  const questions = await db.question.filter((q) => q.deletedAt === null).toArray();
  const lessons = await liveRows(
    db.lesson,
    questions.map((q) => q.lessonId),
  );
  const mine = questions.filter((q) => lessons.has(q.lessonId));
  const views = await questionViews(mine, db);
  return views
    .map((question) => ({ question, lesson: lessons.get(question.lessonId)! }))
    .toSorted(
      (a, b) =>
        b.question.createdAt.localeCompare(a.question.createdAt) ||
        b.question.id.localeCompare(a.question.id),
    );
}

/**
 * A thread in a line (M10-11, wireframes/thinking.md): "Asked 3 times since March · 1 partial
 * answer". Null for a question asked once with nothing since, which needs no summary.
 */
export function lineageSummary(entries: readonly QuestionEntry[], now = new Date()): string | null {
  const { asked, partial, since } = lineageOf(entries);
  if (since === null || (asked <= 1 && partial === 0)) return null;
  const month = monthLabel(today(new Date(since)), now);
  const parts = [
    asked > 1 ? `Asked ${asked} times since ${month}` : `Asked in ${month}`,
    ...(partial > 0 ? [count(partial, 'partial answer')] : []),
  ];
  return parts.join(' · ');
}
