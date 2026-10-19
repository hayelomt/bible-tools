import {
  ALL_RESURFACING,
  daysBetween,
  dismissalKey,
  dismissedOn,
  isDue,
  type Lesson,
  type MemoryItem,
  openSince,
  type Question,
  type ResurfaceDismissal,
  type Resurfacing,
  STALE_DAYS,
} from '@lamp/domain';
import { today as todayOn } from '../lib/dates.ts';
import { type QuestionView, type StatusRows, viewOf } from './question-view.ts';

/**
 * What waits in the review queue: open questions of live lessons and the verses due `today` (the
 * Review tab's count, and the weekly reminder's). Pure, so the service worker counts the same
 * rows it reads without Dexie.
 */
export interface ReviewCount {
  questions: number;
  verses: number;
}

export interface QueueRows extends StatusRows {
  questions: readonly Question[];
  lessons: readonly Lesson[];
  items: readonly MemoryItem[];
  /** Resurfaced items dismissed for a year (F30); missing before M12. */
  dismissals?: readonly ResurfaceDismissal[];
  resurfacing?: Resurfacing;
}

export function countWaiting(
  {
    questions,
    lessons,
    items,
    dismissals = [],
    resurfacing = ALL_RESURFACING,
    ...status
  }: QueueRows,
  today: string,
): ReviewCount {
  const live = new Set(lessons.filter((l) => l.deletedAt === null).map((l) => l.id));
  const dismissed = dismissedOn(dismissals, today);
  // A stale question dismissed for a year is out of the queue, so it isn't waiting either.
  const hidden = (question: QuestionView) =>
    resurfacing.staleQuestion &&
    dismissed.has(dismissalKey('stale_question', question.id)) &&
    isStale(question, today);
  return {
    questions: questions.filter((q) => {
      if (q.deletedAt !== null || !live.has(q.lessonId)) return false;
      const view = viewOf(q, status);
      return view.status === 'open' && !hidden(view);
    }).length,
    verses: items.filter((item) => item.deletedAt === null && isDue(item, today)).length,
  };
}

/** Open for more than 90 days since it was asked or reopened (F30's "stale question"). */
export function isStale(question: QuestionView, today: string): boolean {
  const since = todayOn(new Date(openSince(question.entries, question.createdAt)));
  return daysBetween(since, today) > STALE_DAYS;
}
