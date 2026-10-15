import { describe, expect, it } from 'vitest';
import {
  type Passage,
  checkPassage,
  formatPassage,
  parsePassageSlug,
  passageRange,
  passageSlug,
  passagesOverlap,
  rangesOverlap,
  verseOrdinal,
} from './verse-ref.ts';

const rom = (p: Omit<Passage, 'book'>): Passage => ({ book: 'ROM', ...p });

describe('verse ordinals', () => {
  it('encode book index, chapter and verse', () => {
    expect(verseOrdinal('GEN', 1, 1)).toBe(1_001_001);
    expect(verseOrdinal('ROM', 8, 28)).toBe(45_008_028);
    expect(verseOrdinal('REV', 22, 21)).toBe(66_022_021);
  });

  it.each<[string, Passage, readonly [number, number]]>([
    ['a verse', rom({ chapter: 8, verseStart: 28 }), [45_008_028, 45_008_028]],
    ['a verse range', rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), [45_008_028, 45_008_030]],
    ['a whole chapter', rom({ chapter: 8 }), [45_008_000, 45_008_999]],
    ['a chapter range', rom({ chapter: 8, chapterEnd: 9 }), [45_008_000, 45_009_999]],
    [
      'a cross-chapter range',
      rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }),
      [45_008_038, 45_009_005],
    ],
  ])('turn %s into a range', (_, passage, range) => {
    expect(passageRange(passage)).toEqual(range);
  });
});

describe('overlap', () => {
  // prettier-ignore
  const cases: [string, Passage, Passage, boolean][] = [
    // verses
    ['the same verse', rom({ chapter: 8, verseStart: 28 }), rom({ chapter: 8, verseStart: 28 }), true],
    ['neighbouring verses', rom({ chapter: 8, verseStart: 28 }), rom({ chapter: 8, verseStart: 29 }), false],
    ['the same verse in another chapter', rom({ chapter: 8, verseStart: 1 }), rom({ chapter: 9, verseStart: 1 }), false],
    ['the same place in another book', rom({ chapter: 8, verseStart: 28 }), { book: 'GAL', chapter: 8, verseStart: 28 }, false],
    // ranges
    ['a verse inside a range', rom({ chapter: 8, verseStart: 29 }), rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), true],
    ['a range ending where another starts', rom({ chapter: 8, verseStart: 26, verseEnd: 28 }), rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), true],
    ['ranges side by side', rom({ chapter: 8, verseStart: 26, verseEnd: 27 }), rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), false],
    ['a range inside a range', rom({ chapter: 8, verseStart: 29, verseEnd: 29 }), rom({ chapter: 8, verseStart: 1, verseEnd: 39 }), true],
    // whole chapters
    ['a verse and its chapter', rom({ chapter: 8, verseStart: 1 }), rom({ chapter: 8 }), true],
    ['the last verse and its chapter', rom({ chapter: 8, verseStart: 39 }), rom({ chapter: 8 }), true],
    ['a verse and the next chapter', rom({ chapter: 8, verseStart: 39 }), rom({ chapter: 9 }), false],
    ['two whole chapters', rom({ chapter: 8 }), rom({ chapter: 9 }), false],
    ['a chapter and itself', rom({ chapter: 8 }), rom({ chapter: 8 }), true],
    ['a chapter inside a chapter range', rom({ chapter: 9 }), rom({ chapter: 8, chapterEnd: 10 }), true],
    ['a chapter after a chapter range', rom({ chapter: 11 }), rom({ chapter: 8, chapterEnd: 10 }), false],
    // cross-chapter ranges
    ['Rom 8:38–9:5 and Rom 9', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 9 }), true],
    ['Rom 8:38–9:5 and Rom 8', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 8 }), true],
    ['Rom 8:38–9:5 and Rom 9:3', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 9, verseStart: 3 }), true],
    ['Rom 8:38–9:5 and Rom 9:6', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 9, verseStart: 6 }), false],
    ['Rom 8:38–9:5 and Rom 8:37', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 8, verseStart: 37 }), false],
    ['Rom 8:38–9:5 and Rom 7', rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), rom({ chapter: 7 }), false],
    ['two cross-chapter ranges', rom({ chapter: 7, verseStart: 20, chapterEnd: 8, verseEnd: 2 }), rom({ chapter: 8, verseStart: 1, chapterEnd: 9, verseEnd: 1 }), true],
    ['Rom 16 and 1 Cor 1:1', rom({ chapter: 16 }), { book: '1CO', chapter: 1, verseStart: 1 }, false],
  ];

  it.each(cases)('%s: %j / %j → %s', (_, a, b, expected) => {
    expect(passagesOverlap(a, b)).toBe(expected);
    expect(passagesOverlap(b, a)).toBe(expected);
  });

  it('works on ranges directly', () => {
    expect(rangesOverlap([1, 5], [5, 9])).toBe(true);
    expect(rangesOverlap([1, 4], [5, 9])).toBe(false);
  });
});

describe('formatPassage', () => {
  it.each<[Passage, string]>([
    [rom({ chapter: 8 }), 'Romans 8'],
    [rom({ chapter: 8, verseStart: 28 }), 'Romans 8:28'],
    [rom({ chapter: 8, verseStart: 28, verseEnd: 28 }), 'Romans 8:28'],
    [rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), 'Romans 8:28–30'],
    [rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), 'Romans 8:38–9:5'],
    [rom({ chapter: 8, chapterEnd: 9 }), 'Romans 8–9'],
    [{ book: 'PSA', chapter: 23 }, 'Psalm 23'],
    [{ book: 'PSA', chapter: 23, verseStart: 1 }, 'Psalm 23:1'],
    [{ book: 'PSA', chapter: 1, chapterEnd: 2 }, 'Psalms 1–2'],
    [{ book: '1JN', chapter: 3, verseStart: 16 }, '1 John 3:16'],
    [{ book: 'SNG', chapter: 2, verseStart: 4 }, 'Song of Solomon 2:4'],
    [{ book: 'JUD', chapter: 1 }, 'Jude'],
    [{ book: 'JUD', chapter: 1, verseStart: 3 }, 'Jude 3'],
    [{ book: 'JUD', chapter: 1, verseStart: 24, verseEnd: 25 }, 'Jude 24–25'],
  ])('%j → %s', (passage, display) => {
    expect(formatPassage(passage)).toBe(display);
  });
});

describe('checkPassage', () => {
  // prettier-ignore
  it.each<[Passage, ReturnType<typeof checkPassage>]>([
    [rom({ chapter: 8 }), undefined],
    [rom({ chapter: 16, verseStart: 25 }), undefined],
    [rom({ chapter: 16, verseStart: 28 }), { code: 'verse-out-of-range', book: 'ROM', chapter: 16, verse: 28, max: 27 }],
    [rom({ chapter: 8, chapterEnd: 9 }), undefined],
    [rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 5 }), undefined],
    [rom({ chapter: 17 }), { code: 'chapter-out-of-range', book: 'ROM', chapter: 17, max: 16 }],
    [rom({ chapter: 0 }), { code: 'chapter-out-of-range', book: 'ROM', chapter: 0, max: 16 }],
    [rom({ chapter: 8, chapterEnd: 17 }), { code: 'chapter-out-of-range', book: 'ROM', chapter: 17, max: 16 }],
    [rom({ chapter: 8, verseStart: 40 }), { code: 'verse-out-of-range', book: 'ROM', chapter: 8, verse: 40, max: 39 }],
    [rom({ chapter: 8, verseStart: 0 }), { code: 'verse-out-of-range', book: 'ROM', chapter: 8, verse: 0, max: 39 }],
    [rom({ chapter: 8, verseStart: 38, chapterEnd: 9, verseEnd: 34 }), { code: 'verse-out-of-range', book: 'ROM', chapter: 9, verse: 34, max: 33 }],
    [rom({ chapter: 8, verseStart: 30, verseEnd: 28 }), { code: 'range-reversed' }],
    [rom({ chapter: 9, chapterEnd: 8 }), { code: 'range-reversed' }],
    [rom({ chapter: 8, chapterEnd: 8 }), { code: 'range-reversed' }],
    [rom({ chapter: 8.5 }), { code: 'invalid-shape' }],
    [rom({ chapter: -1 }), { code: 'invalid-shape' }],
    [rom({ chapter: 8, verseEnd: 3 }), { code: 'invalid-shape' }],
    [rom({ chapter: 8, verseStart: 3, chapterEnd: 9 }), { code: 'invalid-shape' }],
  ])('%j → %j', (passage, error) => {
    expect(checkPassage(passage)).toEqual(error);
  });
});

describe('passage slugs', () => {
  it('round-trip every shape', () => {
    const cases: [Passage, string][] = [
      [rom({ chapter: 8 }), 'ROM.8'],
      [rom({ chapter: 8, chapterEnd: 9 }), 'ROM.8-9'],
      [rom({ chapter: 8, verseStart: 28 }), 'ROM.8.28'],
      [rom({ chapter: 8, verseStart: 28, verseEnd: 30 }), 'ROM.8.28-30'],
      [rom({ chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 }), 'ROM.7.24-8.2'],
      [{ book: '1JN', chapter: 4, verseStart: 8 }, '1JN.4.8'],
    ];
    for (const [passage, slug] of cases) {
      expect(passageSlug(passage)).toBe(slug);
      expect(parsePassageSlug(slug)).toEqual(passage);
    }
    expect(passageSlug(rom({ chapter: 8, verseStart: 28, verseEnd: 28 }))).toBe('ROM.8.28');
    // As a chip's attributes hold them in the editor.
    const attrs = { book: 'ROM', chapter: 8, verseStart: 28, chapterEnd: null, verseEnd: null };
    expect(passageSlug(attrs as unknown as Passage)).toBe('ROM.8.28');
  });

  it("reject what isn't a passage that exists", () => {
    for (const slug of [
      '',
      'ROM',
      'XYZ.1',
      'ROM.17',
      'ROM.8.40',
      'ROM.8-7',
      'ROM.8-9.2',
      'rom.8',
    ]) {
      expect(parsePassageSlug(slug)).toBeNull();
    }
  });
});
