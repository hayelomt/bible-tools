import { type BookCode, chapterCount, isBookCode, verseCount } from '@lamp/domain';
import type { Chapter } from './chapters.ts';

/** Where the reader was left, on this device (M5-01, decided 2026-10-13: not synced). */
export interface ReadingPosition extends Chapter {
  /** The verse at the top of the screen. */
  verse: number;
}

const KEY = 'lamp.readingPosition';

/** Where the reader opens before anything has been read. */
export const FIRST_POSITION: ReadingPosition = { book: 'JHN', chapter: 1, verse: 1 };

function isPosition(value: unknown): value is ReadingPosition {
  if (typeof value !== 'object' || value === null) return false;
  const { book, chapter, verse } = value as Record<string, unknown>;
  return (
    typeof book === 'string' &&
    isBookCode(book) &&
    Number.isInteger(chapter) &&
    (chapter as number) >= 1 &&
    (chapter as number) <= chapterCount(book) &&
    Number.isInteger(verse) &&
    (verse as number) >= 1 &&
    (verse as number) <= verseCount(book as BookCode, chapter as number)
  );
}

/** The last place read, or John 1 the first time; storage that's blocked or full means John 1. */
export function readingPosition(): ReadingPosition {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (isPosition(stored))
      return { book: stored.book, chapter: stored.chapter, verse: stored.verse };
  } catch {
    // Unreadable: start again.
  }
  return FIRST_POSITION;
}

export function rememberPosition({ book, chapter, verse }: ReadingPosition): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ book, chapter, verse }));
  } catch {
    // Not remembered; the reader opens at John 1 next time.
  }
}
