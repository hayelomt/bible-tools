import { describe, expect, it } from 'vitest';
import { passageText, passageVerses } from './lookup.ts';
import type { BookText } from './usfm.ts';

// A made-up book: chapter 1 has 3 verses (the second empty), chapter 2 has 2, chapter 3 has 1.
const BOOK: BookText = { c: [['a1', '', 'a3'], ['b1', 'b2'], ['c1']], n: { '1:2': 'Some add…' } };
const ROM = 'ROM' as const;

describe('passageVerses', () => {
  it.each([
    ['one verse', { book: ROM, chapter: 2, verseStart: 2 }, ['2:2']],
    ['a range', { book: ROM, chapter: 1, verseStart: 1, verseEnd: 3 }, ['1:1', '1:2', '1:3']],
    ['a whole chapter', { book: ROM, chapter: 2 }, ['2:1', '2:2']],
    ['whole chapters', { book: ROM, chapter: 2, chapterEnd: 3 }, ['2:1', '2:2', '3:1']],
    [
      'a range across chapters',
      { book: ROM, chapter: 1, verseStart: 3, chapterEnd: 3, verseEnd: 1 },
      ['1:3', '2:1', '2:2', '3:1'],
    ],
    ['verses past the end', { book: ROM, chapter: 2, verseStart: 2, verseEnd: 9 }, ['2:2']],
    ['a chapter past the end', { book: ROM, chapter: 9 }, []],
  ])('returns %s', (_, passage, expected) => {
    expect(passageVerses(BOOK, passage).map((v) => `${v.chapter}:${v.verse}`)).toEqual(expected);
  });

  it('includes the text, empty for a verse the translation leaves out', () => {
    expect(passageVerses(BOOK, { book: ROM, chapter: 1, verseStart: 2 })).toEqual([
      { chapter: 1, verse: 2, text: '' },
    ]);
  });
});

describe('passageText', () => {
  it('joins verse texts with spaces and skips empty verses', () => {
    expect(passageText(BOOK, { book: ROM, chapter: 1 })).toBe('a1 a3');
    expect(passageText(BOOK, { book: ROM, chapter: 1, verseStart: 2 })).toBe('');
  });
});
