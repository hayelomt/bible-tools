import { describe, expect, it } from 'vitest';
import type { Passage } from './verse-ref.ts';
import { kjvToWeb } from './versification.ts';

const rom = (p: Omit<Passage, 'book'>): Passage => ({ book: 'ROM', ...p });

describe('kjvToWeb', () => {
  it.each<[string, Passage, Passage]>([
    ['a moved verse', rom({ chapter: 16, verseStart: 27 }), rom({ chapter: 14, verseStart: 26 })],
    [
      'a range of moved verses',
      rom({ chapter: 16, verseStart: 25, verseEnd: 27 }),
      rom({ chapter: 14, verseStart: 24, verseEnd: 26 }),
    ],
    [
      'a range ending on a moved verse',
      rom({ chapter: 16, verseStart: 20, verseEnd: 27 }),
      rom({ chapter: 16, verseStart: 20, verseEnd: 25 }),
    ],
    [
      'a cross-chapter range ending on a moved verse',
      rom({ chapter: 1, verseStart: 1, chapterEnd: 16, verseEnd: 27 }),
      rom({ chapter: 1, verseStart: 1, chapterEnd: 16, verseEnd: 25 }),
    ],
    [
      'a range starting on a moved verse',
      rom({ chapter: 16, verseStart: 26, chapterEnd: 17, verseEnd: 1 }),
      rom({ chapter: 14, verseStart: 25, chapterEnd: 17, verseEnd: 1 }),
    ],
  ])('maps %s', (_, kjv, web) => {
    expect(kjvToWeb(kjv)).toEqual(web);
  });

  it.each<[string, Passage]>([
    ['a verse WEB numbers the same', rom({ chapter: 16, verseStart: 24 })],
    [
      'a range that already ends at the end of WEB 16',
      rom({ chapter: 16, verseStart: 20, verseEnd: 25 }),
    ],
    ['a whole chapter', rom({ chapter: 16 })],
    ['a backwards range', rom({ chapter: 16, verseStart: 27, verseEnd: 20 })],
    [
      'a backwards cross-chapter range',
      rom({ chapter: 16, verseStart: 27, chapterEnd: 15, verseEnd: 1 }),
    ],
    ['a book with no differences', { book: 'MAT', chapter: 23, verseStart: 13 }],
  ])('leaves %s alone', (_, passage) => {
    expect(kjvToWeb(passage)).toBeUndefined();
  });
});
