import {
  ALL_RESURFACING,
  dismissalKey,
  dismissedOn,
  type Lesson,
  openSince,
  type Passage,
  passageSlug,
  repeatedVerses,
  type ResurfaceRule,
  yearsAgo,
} from '@lamp/domain';
import { today as todayOn } from '@/lib/dates.ts';
import { db as appDb, type LampDb, SETTINGS_KEY } from './db.ts';
import { byDate } from './queries.ts';
import { type QuestionView, statusRows, viewOf } from './question-status.ts';
import { isStale } from './review-count.ts';

/**
 * "Back again" in the review queue (F30, wireframes/reflection.md): old material brought back by
 * three rules, each of which Settings → Review turns off. Read on the device, like the rest of the
 * queue.
 */

interface Resurfaced {
  rule: ResurfaceRule;
  /** The dismissal's target: a lesson or question id, or a passage slug. */
  targetKey: string;
}

/** A lesson from the same week in an earlier year, with its questions still open. */
export interface YearAgo extends Resurfaced {
  rule: 'year_ago';
  lesson: Lesson;
  years: number;
  sections: number;
  questions: QuestionView[];
}

/** A verse cited in three or more lessons whose commentary hasn't been read in six months. */
export interface RepeatedVerseItem extends Resurfaced {
  rule: 'repeated_verse';
  passage: Passage;
  lessons: number;
  /** The last day its commentary was opened, or null for never. */
  lastVisit: string | null;
}

/** A question open for more than 90 days. */
export interface StaleQuestion extends Resurfaced {
  rule: 'stale_question';
  question: QuestionView;
  lesson: Lesson;
  /** The day it was asked, or reopened. */
  since: string;
}

export type ResurfacedItem = YearAgo | RepeatedVerseItem | StaleQuestion;

export interface BackAgain {
  /** A year ago first, then repeated verses, then stale questions. */
  items: ResurfacedItem[];
  /**
   * Open questions that aren't listed under Open questions: those shown here, so none is listed
   * twice, and stale ones dismissed, which stay out of the queue for a year.
   */
  questionIds: Set<string>;
}

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

const dayOf = (iso: string) => todayOn(new Date(iso));

export async function backAgain(today: string, db: LampDb = appDb): Promise<BackAgain> {
  const settings = await db.userSettings.get(SETTINGS_KEY);
  const rules = settings?.resurfacing ?? ALL_RESURFACING;
  const dismissed = dismissedOn(await db.resurfaceDismissal.toArray(), today);
  const shown = (rule: ResurfaceRule, targetKey: string) =>
    !dismissed.has(dismissalKey(rule, targetKey));

  const lessons = new Map(
    (await db.lesson.filter((l) => l.deletedAt === null).toArray()).map((l) => [l.id, l]),
  );
  const questions = await db.question
    .filter((q) => q.deletedAt === null && lessons.has(q.lessonId))
    .toArray();
  const status = await statusRows(
    questions.map((q) => q.id),
    db,
  );
  const open = questions.map((q) => viewOf(q, status)).filter((q) => q.status === 'open');
  const questionIds = new Set<string>();

  const yearAgo: YearAgo[] = [];
  if (rules.yearAgo) {
    const found = [...lessons.values()]
      .map((lesson) => ({ lesson, years: yearsAgo(lesson.date, today) }))
      .filter(({ lesson, years }) => years > 0 && shown('year_ago', lesson.id))
      .toSorted((a, b) => byDate(b.lesson, a.lesson));
    for (const { lesson, years } of found) {
      const own = open
        .filter((q) => q.lessonId === lesson.id)
        .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
      for (const q of own) questionIds.add(q.id);
      const sections = await db.section
        .where('lessonId')
        .equals(lesson.id)
        .filter((s) => s.deletedAt === null)
        .count();
      yearAgo.push({
        rule: 'year_ago',
        targetKey: lesson.id,
        lesson,
        years,
        sections,
        questions: own,
      });
    }
  }

  const repeated: RepeatedVerseItem[] = [];
  if (rules.repeatedVerse) {
    const citations = await db.citation
      .filter((c) => c.sourceType === 'section' && c.lessonId !== null && lessons.has(c.lessonId))
      .toArray();
    const visits = (await db.passageVisit.filter(live).toArray()).map((v) => ({
      startOrd: v.startOrd,
      endOrd: v.endOrd,
      day: dayOf(v.createdAt),
    }));
    const verses = repeatedVerses(
      citations.map((c) => ({ lessonId: c.lessonId!, startOrd: c.startOrd, endOrd: c.endOrd })),
      visits,
      today,
    );
    for (const verse of verses) {
      const targetKey = passageSlug(verse.passage);
      if (shown('repeated_verse', targetKey)) {
        repeated.push({ rule: 'repeated_verse', targetKey, ...verse });
      }
    }
  }

  const stale: StaleQuestion[] = [];
  if (rules.staleQuestion) {
    for (const question of open) {
      if (questionIds.has(question.id)) continue;
      if (!isStale(question, today)) continue;
      questionIds.add(question.id);
      if (!shown('stale_question', question.id)) continue;
      stale.push({
        rule: 'stale_question',
        targetKey: question.id,
        question,
        lesson: lessons.get(question.lessonId)!,
        since: dayOf(openSince(question.entries, question.createdAt)),
      });
    }
    stale.sort(
      (a, b) => a.since.localeCompare(b.since) || a.question.id.localeCompare(b.question.id),
    );
  }

  return { items: [...yearAgo, ...repeated, ...stale], questionIds };
}
