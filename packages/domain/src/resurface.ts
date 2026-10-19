import { bookByIndex, verseCount } from './books.ts';
import { threadOf } from './questions.ts';
import type {
  QuestionEntry,
  ResurfaceDismissal,
  ResurfaceRule,
  Resurfacing,
} from './schemas/entities.ts';
import { addDays } from './srs.ts';
import { type Passage, verseOrdinal } from './verse-ref.ts';

/**
 * The review queue's resurfacing rules (F30, TECH-DESIGN §8.8, §17.8), pure: the device reads the
 * rows and these decide what comes back. Dates are calendar days ("2026-10-19") on the device.
 */

/** Every rule on: the setting's default (§17.9). */
export const ALL_RESURFACING: Resurfacing = {
  yearAgo: true,
  repeatedVerse: true,
  staleQuestion: true,
};

/** "Repeated verse": cited in this many lessons or more… */
export const REPEATED_LESSONS = 3;
/** …with no compile view visit overlapping it in this many months. */
export const UNVISITED_MONTHS = 6;
/** "Stale question": open for more than this many days. */
export const STALE_DAYS = 90;
/** A citation over more chapters than this (a book, a long run) isn't "a verse". */
const MAX_CHAPTERS = 2;

const yearOf = (date: string) => Number(date.slice(0, 4));
const pad = (n: number) => String(n).padStart(2, '0');

/** The same month and day in `year`, 28 February for a 29 February the year doesn't have. */
function sameDayIn(date: string, year: number): string {
  const leap = new Date(Date.UTC(year, 1, 29)).getUTCMonth() === 1;
  return date.slice(5) === '02-29' && !leap ? `${year}-02-28` : `${year}${date.slice(4)}`;
}

/** `date` moved by whole months, the day kept where the month has it (31 March − 1 → 28 Feb). */
export function addMonths(date: string, months: number): string {
  const total = yearOf(date) * 12 + Number(date.slice(5, 7)) - 1 + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(Number(date.slice(8, 10)), last))}`;
}

/** The Monday on or before `date`. */
export function weekStart(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((weekday + 6) % 7));
}

/** The Monday-to-Sunday week, in `year`, holding today's month and day. */
export function weekIn(today: string, year: number): readonly [start: string, end: string] {
  const start = weekStart(sameDayIn(today, year));
  return [start, addDays(start, 6)];
}

/**
 * "A year ago" (F30, decided in M12-01): how many years before `today` the week `date` falls in
 * is, when it's the Monday-to-Sunday week holding today's month and day in an earlier year; 0
 * otherwise. Weeks are calendar weeks, so the block stays the same from Monday to Sunday.
 */
export function yearsAgo(date: string, today: string): number {
  const year = yearOf(today);
  // A week can start in the year before the date or end in the year after it.
  for (const candidate of [yearOf(date) - 1, yearOf(date), yearOf(date) + 1]) {
    if (candidate >= year) continue;
    const [start, end] = weekIn(today, candidate);
    if (date >= start && date <= end) return year - candidate;
  }
  return 0;
}

/** A section's citation, with its lesson: what "repeated verse" counts. */
export interface CitedRange {
  lessonId: string;
  startOrd: number;
  endOrd: number;
}

/** A compile view visit: its scope, and the day it was made. */
export interface VisitedRange {
  startOrd: number;
  endOrd: number;
  day: string;
}

export interface RepeatedVerse {
  /** A verse, a run of verses, or a whole chapter. */
  passage: Passage;
  /** How many lessons cite it. */
  lessons: number;
  /** The last day a compile view overlapping it was opened, or null for never. */
  lastVisit: string | null;
}

/** A verse ordinal's chapter, as book·1000 + chapter, and its verse. */
const chapterOf = (ord: number) => Math.floor(ord / 1000);
const verseOf = (ord: number) => ord % 1000;
const bookIndexOf = (chapter: number) => Math.floor(chapter / 1000);

/**
 * "Repeated verse" (F30, decided in M12-01): a verse cited in `REPEATED_LESSONS` or more lessons,
 * with no compile view visit overlapping it since `UNVISITED_MONTHS` ago. Lessons are counted per
 * verse, so "Romans 8" and "Romans 8:28" both count for 8:28; each chapter gives at most one, the
 * first run of verses with its highest count cited by the same lessons. A run that is the whole
 * chapter is the chapter. Most lessons first, then in canonical order.
 */
export function repeatedVerses(
  citations: readonly CitedRange[],
  visits: readonly VisitedRange[],
  today: string,
): RepeatedVerse[] {
  // Chapter (book·1000 + chapter) → verse → the lessons citing it.
  const chapters = new Map<number, Map<number, Set<string>>>();
  for (const { lessonId, startOrd, endOrd } of citations) {
    const [first, last] = [chapterOf(startOrd), chapterOf(endOrd)];
    if (last - first + 1 > MAX_CHAPTERS || bookIndexOf(first) !== bookIndexOf(last)) continue;
    const book = bookByIndex(bookIndexOf(first));
    if (!book) continue;
    for (let chapter = first; chapter <= last; chapter++) {
      const count = verseCount(book.code, chapter % 1000);
      const from = chapter === first ? Math.max(verseOf(startOrd), 1) : 1;
      const to = chapter === last ? Math.min(verseOf(endOrd), count) : count;
      let verses = chapters.get(chapter);
      if (!verses) chapters.set(chapter, (verses = new Map()));
      for (let verse = from; verse <= to; verse++) {
        let lessons = verses.get(verse);
        if (!lessons) verses.set(verse, (lessons = new Set()));
        lessons.add(lessonId);
      }
    }
  }

  const since = addMonths(today, -UNVISITED_MONTHS);
  const found: (RepeatedVerse & { start: number })[] = [];
  for (const [chapter, verses] of chapters) {
    const most = Math.max(...[...verses.values()].map((lessons) => lessons.size));
    if (most < REPEATED_LESSONS) continue;
    const ordered = [...verses.keys()].toSorted((a, b) => a - b);
    const from = ordered.find((verse) => verses.get(verse)!.size === most)!;
    const lessons = verses.get(from)!;
    let to = from;
    while (sameSet(verses.get(to + 1), lessons)) to++;

    const book = bookByIndex(bookIndexOf(chapter))!.code;
    const number = chapter % 1000;
    const passage: Passage =
      from === 1 && to === verseCount(book, number)
        ? { book, chapter: number }
        : { book, chapter: number, verseStart: from, ...(to !== from ? { verseEnd: to } : {}) };
    const [start, end] = [verseOrdinal(book, number, from), verseOrdinal(book, number, to)];
    const lastVisit =
      visits
        .filter((visit) => visit.startOrd <= end && start <= visit.endOrd)
        .map((visit) => visit.day)
        .toSorted()
        .at(-1) ?? null;
    if (lastVisit !== null && lastVisit >= since) continue;
    found.push({ passage, lessons: lessons.size, lastVisit, start });
  }
  return found
    .toSorted((a, b) => b.lessons - a.lessons || a.start - b.start)
    .map(({ start: _start, ...verse }) => verse);
}

function sameSet(a: ReadonlySet<string> | undefined, b: ReadonlySet<string>): boolean {
  return !!a && a.size === b.size && [...a].every((id) => b.has(id));
}

type OpenEntry = Pick<QuestionEntry, 'createdAt' | 'id' | 'deletedAt' | 'kind'>;

/**
 * When an open question was last opened: its latest `asked` or `reopened` entry, so a revisit or a
 * partial answer doesn't make it new again, and a reopened question counts from the reopening.
 * Its first entry when it has neither; `fallback` (the question's own `createdAt`) when it has none.
 */
export function openSince(entries: readonly OpenEntry[], fallback: string): string {
  const thread = threadOf(entries);
  return (
    thread.findLast((entry) => entry.kind === 'asked' || entry.kind === 'reopened')?.createdAt ??
    thread[0]?.createdAt ??
    fallback
  );
}

/** A dismissal's key: its rule and target. */
export const dismissalKey = (rule: ResurfaceRule, targetKey: string) => `${rule}:${targetKey}`;

/**
 * The resurfaced items hidden on `today` (§17.8), by `dismissalKey`: a live dismissal until a
 * later day. For a target, the latest `until` wins.
 */
export function dismissedOn(
  dismissals: readonly Pick<ResurfaceDismissal, 'rule' | 'targetKey' | 'until' | 'deletedAt'>[],
  today: string,
): Set<string> {
  return new Set(
    dismissals
      .filter((d) => d.deletedAt === null && d.until > today)
      .map((d) => dismissalKey(d.rule, d.targetKey)),
  );
}

/** "Dismiss for a year": hidden until the same day next year. */
export const dismissedUntil = (today: string): string => sameDayIn(today, yearOf(today) + 1);
