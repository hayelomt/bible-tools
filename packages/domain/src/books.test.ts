import { describe, expect, it } from 'vitest';
import {
  BOOK_CODES,
  BOOKS,
  bookByIndex,
  bookKey,
  chapterCount,
  getBook,
  isBookCode,
  verseCount,
} from './books.ts';

describe('book table', () => {
  it('has the 66 books in canonical order, 39 OT and 27 NT', () => {
    expect(BOOKS).toHaveLength(66);
    expect(BOOKS.map((b) => b.code)).toEqual(BOOK_CODES);
    expect(BOOKS.map((b) => b.index)).toEqual(BOOKS.map((_, i) => i + 1));
    expect(BOOKS.filter((b) => b.testament === 'OT')).toHaveLength(39);
    expect(BOOKS.at(39)?.code).toBe('MAT');
  });

  // The per-chapter counts are checked against both translations' text by the @lamp/bible-data
  // build; these totals and spot checks keep the table honest without it.
  it('matches the KJV totals: 1,189 chapters and 31,102 verses', () => {
    const chapters = BOOKS.reduce((n, b) => n + b.verses.length, 0);
    const verses = BOOKS.reduce((n, b) => n + b.verses.reduce((x, y) => x + y, 0), 0);
    expect(chapters).toBe(1189);
    expect(verses).toBe(31_102);
  });

  it.each([
    ['GEN', 50, 1, 31],
    ['PSA', 150, 119, 176],
    ['PSA', 150, 117, 2],
    ['JOL', 3, 2, 32],
    ['MAL', 4, 4, 6],
    ['ROM', 16, 8, 39],
    ['ROM', 16, 14, 23],
    ['ROM', 16, 16, 27], // the doxology is 16:25–27
    ['3JN', 1, 1, 14],
    ['JUD', 1, 1, 25],
    ['REV', 22, 12, 17],
  ] as const)('%s has %i chapters; chapter %i has %i verses', (code, chapters, chapter, verses) => {
    expect(chapterCount(code)).toBe(chapters);
    expect(verseCount(code, chapter)).toBe(verses);
  });

  it('has a verse count of at least 1 for every chapter', () => {
    for (const book of BOOKS) expect(Math.min(...book.verses)).toBeGreaterThanOrEqual(1);
  });

  it('gives 0 verses for a chapter that does not exist', () => {
    expect(verseCount('ROM', 17)).toBe(0);
    expect(verseCount('ROM', 0)).toBe(0);
  });

  it('never gives one alias to two books', () => {
    const aliases = BOOKS.flatMap((book) => book.aliases);
    const repeated = aliases.filter((alias, i) => aliases.indexOf(alias) !== i);
    expect(repeated).toEqual([]);
  });

  it('stores aliases already normalised, numbered with their book number', () => {
    for (const book of BOOKS) {
      expect(book.aliases).toContain(bookKey(book.name));
      expect(book.aliases.filter((alias) => bookKey(alias) !== alias)).toEqual([]);
      const prefix = String(book.number ?? '');
      expect(book.aliases.every((alias) => alias.startsWith(prefix))).toBe(true);
    }
  });

  it('includes each USFM code as an alias, except JUD (also short for Judges)', () => {
    for (const book of BOOKS) {
      expect(book.aliases.includes(book.code.toLowerCase())).toBe(book.code !== 'JUD');
    }
  });

  it('uses "Psalm" before a chapter, and the name elsewhere', () => {
    expect(getBook('PSA')).toMatchObject({ name: 'Psalms', refName: 'Psalm' });
    expect(getBook('ROM')).toMatchObject({ name: 'Romans', refName: 'Romans' });
  });

  it('looks books up by code and index', () => {
    expect(isBookCode('ROM')).toBe(true);
    expect(isBookCode('rom')).toBe(false);
    expect(isBookCode('XYZ')).toBe(false);
    expect(bookByIndex(1)?.code).toBe('GEN');
    expect(bookByIndex(66)?.code).toBe('REV');
    expect(bookByIndex(67)).toBeUndefined();
  });
});

describe('bookKey', () => {
  it.each([
    ['Romans', 'romans'],
    ['  Rom. ', 'rom'],
    ['Song of Solomon', 'songofsolomon'],
    ['1 Jn', '1jn'],
    ['1Jn', '1jn'],
    ['I John', '1john'],
    ['I. John', '1john'],
    ['II Kings', '2kings'],
    ['III John', '3john'],
    ['First John', '1john'],
    ['second  Peter', '2peter'],
    ['Third John', '3john'],
    ['1st Jn.', '1jn'],
    ['2nd Tim', '2tim'],
    ['3rd John', '3john'],
    ['Isaiah', 'isaiah'],
    ['Is', 'is'],
    ['Firstly', 'firstly'],
  ])('%j → %j', (name, key) => {
    expect(bookKey(name)).toBe(key);
  });
});
