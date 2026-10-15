import { BOOKS } from '@lamp/domain';
import type { BookText } from './book-text.ts';

/**
 * Reads a translation's source JSON into book texts (TECH-DESIGN §9). The source is an array of the
 * 66 books in canonical order, each `{ abbrev, name, chapters: string[][] }`; its abbreviations and
 * names are Portuguese, so books are matched by position.
 */

/** One book of the source file. */
export interface SourceBook {
  abbrev: string;
  name: string;
  chapters: string[][];
}

/** The note on a verse the translation leaves out. */
export const OMITTED_NOTE = 'Some later manuscripts include this verse.';

/**
 * Leftovers from the markup the source's text was taken out of: a stray `[’’]` at the end of a
 * verse, `vvv`, and a space before closing punctuation or after "(" ("the LORD ." → "the LORD.").
 * The words are unchanged. Spaces next to straight quotes are left: whether one opens or closes
 * can't be told.
 */
export function cleanVerse(text: string): string {
  return text
    .replaceAll('[’’]', '')
    .replaceAll(/\bvvv\b/g, '')
    .replaceAll(/ +(?=[,.;:?!)’])/g, '')
    .replaceAll(/\( +/g, '(')
    .replaceAll(/ {2,}/g, ' ')
    .trim();
}

/**
 * The source's books by code, cleaned. Verses in `omitted` ("MAT 17:21") are missing from the
 * source's arrays, so the verses after them sit one place early; each goes back in as "" with
 * `OMITTED_NOTE`, so every verse keeps its number.
 */
export function readSource(
  id: string,
  source: readonly SourceBook[],
  omitted: readonly string[] = [],
): Map<string, BookText> {
  if (source.length !== BOOKS.length) {
    throw new Error(`${id}: ${source.length} books, expected ${BOOKS.length}`);
  }
  const gaps = new Map<string, [chapter: number, verse: number][]>();
  for (const ref of omitted) {
    const [, code, chapter, verse] = /^(\w{3}) (\d+):(\d+)$/.exec(ref) ?? [];
    if (!code) throw new Error(`${id}: bad omitted verse ${ref}`);
    gaps.set(code, [...(gaps.get(code) ?? []), [Number(chapter), Number(verse)]]);
  }

  const books = new Map<string, BookText>();
  BOOKS.forEach((book, i) => {
    const text: BookText = { c: source[i]!.chapters.map((verses) => verses.map(cleanVerse)) };
    const bookGaps = (gaps.get(book.code) ?? []).toSorted((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (const [chapter, verse] of bookGaps) {
      const verses = text.c[chapter - 1];
      if (!verses || verse > verses.length + 1) {
        throw new Error(`${id} ${book.code}: no place for omitted ${chapter}:${verse}`);
      }
      verses.splice(verse - 1, 0, '');
      (text.n ??= {})[`${chapter}:${verse}`] = OMITTED_NOTE;
    }
    books.set(book.code, text);
  });
  return books;
}
