/**
 * Scripture memory's schedule (F10, TECH-DESIGN §4.3): SM-2 with four grades, as pure functions of
 * `(state, grade, today)`. Days are calendar dates ("2026-10-14") on the device; `nextReviewAt`
 * stores the due day as its UTC midnight, so a verse is due all of that day wherever it's read.
 *
 * Decided 2026-10-14: a new verse is due the day it's added. From the days since the last review I,
 * Good gives 1 day, then 6, then I × ease; Hard gives 1, then the larger of I + 1 and I × 1.2; Easy
 * gives twice Good, and at least 4; Again starts over, due again today. Ease starts at 2.5; Again
 * takes 0.2 off it, Hard 0.15, and Easy adds 0.15, between 1.3 and 10.
 */

export const GRADES = ['again', 'hard', 'good', 'easy'] as const;
export type Grade = (typeof GRADES)[number];

/** What a memory item keeps of its schedule. */
export interface SrsState {
  ease: number;
  /** Days from the last review to the next; 0 before the first review and after Again. */
  interval: number;
  /** The due day's UTC midnight. */
  nextReviewAt: string;
  reviewCount: number;
}

export const START_EASE = 2.5;
export const MIN_EASE = 1.3;
export const MAX_EASE = 10;

const EASE_CHANGE: Record<Grade, number> = { again: -0.2, hard: -0.15, good: 0, easy: 0.15 };

/** A verse just added: due today, with no reviews yet. */
export function newSrsState(today: string): SrsState {
  return { ease: START_EASE, interval: 0, nextReviewAt: dayStart(today), reviewCount: 0 };
}

/** Days until the verse comes back after `grade`, from the state before the review. */
export function nextInterval(state: Pick<SrsState, 'ease' | 'interval'>, grade: Grade): number {
  const { ease, interval } = state;
  const good = interval === 0 ? 1 : interval < 6 ? 6 : Math.round(interval * ease);
  switch (grade) {
    case 'again':
      return 0;
    case 'hard':
      return interval === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
    case 'good':
      return good;
    case 'easy':
      return Math.max(4, 2 * good);
  }
}

/** The state after a review graded `grade` on `today`. */
export function review(state: SrsState, grade: Grade, today: string): SrsState {
  const interval = nextInterval(state, grade);
  return {
    ease: clampEase(state.ease + EASE_CHANGE[grade]),
    interval,
    nextReviewAt: dayStart(addDays(today, interval)),
    reviewCount: state.reviewCount + 1,
  };
}

/** Days between reviews from which a verse counts as known (as Anki's "mature"). */
export const KNOWN_INTERVAL = 21;

export const MEMORY_STAGES = ['new', 'learning', 'known'] as const;
export type MemoryStage = (typeof MEMORY_STAGES)[number];

/**
 * A verse's progress (decided 2026-10-14): new until its first review, then learning, and known
 * once it comes back after 21 days or more. Again sends a known verse back to learning.
 */
export function memoryStage(state: Pick<SrsState, 'interval' | 'reviewCount'>): MemoryStage {
  if (state.reviewCount === 0) return 'new';
  return state.interval >= KNOWN_INTERVAL ? 'known' : 'learning';
}

/** Due on or before `today`. */
export function isDue(state: Pick<SrsState, 'nextReviewAt'>, today: string): boolean {
  return dueDate(state) <= today;
}

/** The calendar day a verse is due ("2026-10-20"). */
export function dueDate(state: Pick<SrsState, 'nextReviewAt'>): string {
  return state.nextReviewAt.slice(0, 10);
}

/** "2026-10-14" plus `days`. */
export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function dayStart(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function clampEase(ease: number): number {
  // Rounded so repeated steps of 0.15 don't drift (2.5 − 0.15 − 0.15 + 0.3 is 2.5).
  return Math.min(MAX_EASE, Math.max(MIN_EASE, Math.round(ease * 100) / 100));
}
