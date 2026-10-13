import { type BookCode, chapterCount, getBook, verseCount } from './books.ts';

/** Translations with text in the app. Phase 1 ships WEB only (TECH-DESIGN §9). */
export const TRANSLATIONS = ['WEB'] as const;
export type TranslationId = (typeof TRANSLATIONS)[number];
export const DEFAULT_TRANSLATION: TranslationId = 'WEB';
/** Each translation's full name, as an expanded chip and the reader show it. */
export const TRANSLATION_NAMES: Record<TranslationId, string> = { WEB: 'World English Bible' };

/**
 * A passage, without the text: one verse, a verse range, a whole chapter, a chapter range or a
 * range across chapters ("Romans 8:38–9:5").
 */
export interface Passage {
  book: BookCode;
  chapter: number;
  /** Absent = the whole chapter (or chapters, with `chapterEnd`). */
  verseStart?: number;
  /** Absent = the same chapter. Only set when greater than `chapter`. */
  chapterEnd?: number;
  /** Absent = the single verse `verseStart`. */
  verseEnd?: number;
}

/** A passage as captured in a note (TECH-DESIGN §4.1). */
export interface VerseRef extends Passage {
  /** "Romans 8:28–30", formatted from the fields by `formatPassage`. */
  display: string;
  /** Which text the snapshot came from. */
  translation: TranslationId;
  /** Frozen at capture (F3). */
  snapshotText?: string;
}

/** A verse or a [start, end] range as integers: book index·1,000,000 + chapter·1,000 + verse. */
export type OrdinalRange = readonly [start: number, end: number];

export function verseOrdinal(book: BookCode, chapter: number, verse: number): number {
  return getBook(book).index * 1_000_000 + chapter * 1_000 + verse;
}

/** A whole chapter covers verses 0–999 of it, so it overlaps every verse in the chapter. */
export function passageRange(p: Passage): OrdinalRange {
  const endChapter = p.chapterEnd ?? p.chapter;
  const start = verseOrdinal(p.book, p.chapter, p.verseStart ?? 0);
  const endVerse = p.verseStart === undefined ? 999 : (p.verseEnd ?? p.verseStart);
  return [start, verseOrdinal(p.book, endChapter, endVerse)];
}

export function rangesOverlap(a: OrdinalRange, b: OrdinalRange): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

export function passagesOverlap(a: Passage, b: Passage): boolean {
  return rangesOverlap(passageRange(a), passageRange(b));
}

const DASH = '–'; // en dash

/**
 * "Romans 8", "Romans 8:28", "Romans 8:28–30", "Romans 8:38–9:5", "Romans 8–9", "Psalm 23".
 * Books with one chapter drop it: "Jude 3", "Jude 3–5", and "Jude" for the whole book.
 */
export function formatPassage(p: Passage): string {
  const book = getBook(p.book);
  const single = book.verses.length === 1;
  if (p.verseStart === undefined) {
    if (single) return book.name;
    const chapters = p.chapterEnd ? `${p.chapter}${DASH}${p.chapterEnd}` : `${p.chapter}`;
    return `${p.chapterEnd ? book.name : book.refName} ${chapters}`;
  }
  const start = single ? `${p.verseStart}` : `${p.chapter}:${p.verseStart}`;
  let end = '';
  if (p.chapterEnd) end = `${DASH}${p.chapterEnd}:${p.verseEnd}`;
  else if (p.verseEnd !== undefined && p.verseEnd !== p.verseStart) end = `${DASH}${p.verseEnd}`;
  return `${book.refName} ${start}${end}`;
}

const isWhole = (n: number | undefined) => n === undefined || (Number.isInteger(n) && n >= 0);

export type PassageError =
  | { code: 'chapter-out-of-range'; book: BookCode; chapter: number; max: number }
  | { code: 'verse-out-of-range'; book: BookCode; chapter: number; verse: number; max: number }
  | { code: 'range-reversed' }
  | { code: 'invalid-shape' };

/**
 * Checks a passage against the book table: chapters and verses exist, ranges run forwards, and
 * the fields form one of the allowed shapes. Returns the first problem, or undefined.
 */
export function checkPassage(p: Passage): PassageError | undefined {
  const { book, chapter, verseStart, chapterEnd, verseEnd } = p;
  if (![chapter, verseStart, chapterEnd, verseEnd].every(isWhole)) return { code: 'invalid-shape' };
  if (verseEnd !== undefined && verseStart === undefined) return { code: 'invalid-shape' };
  if (chapterEnd !== undefined && (verseStart === undefined) !== (verseEnd === undefined)) {
    return { code: 'invalid-shape' };
  }

  const chapters = chapterCount(book);
  for (const c of [chapter, chapterEnd]) {
    if (c !== undefined && (c < 1 || c > chapters)) {
      return { code: 'chapter-out-of-range', book, chapter: c, max: chapters };
    }
  }
  const verses: [number, number | undefined][] = [
    [chapter, verseStart],
    [chapterEnd ?? chapter, verseEnd],
  ];
  for (const [c, v] of verses) {
    const max = verseCount(book, c);
    if (v !== undefined && (v < 1 || v > max))
      return { code: 'verse-out-of-range', book, chapter: c, verse: v, max };
  }
  if (chapterEnd !== undefined && chapterEnd <= chapter) return { code: 'range-reversed' };
  if (chapterEnd === undefined && verseEnd !== undefined && verseEnd < verseStart!) {
    return { code: 'range-reversed' };
  }
  return undefined;
}
