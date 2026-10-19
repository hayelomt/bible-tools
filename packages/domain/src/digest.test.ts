import { describe, expect, it } from 'vitest';
import { grewMost, lastQuarter, quarterDays, quarterLabel, quarterOf } from './digest.ts';
import { verseOrdinal } from './verse-ref.ts';

describe('quarters', () => {
  it('names the quarter a day is in, and the last to have ended', () => {
    expect(quarterOf('2026-07-01')).toBe('2026-Q3');
    expect(quarterOf('2026-09-30')).toBe('2026-Q3');
    expect(quarterOf('2026-10-01')).toBe('2026-Q4');
    expect(lastQuarter('2026-10-01')).toBe('2026-Q3');
    expect(lastQuarter('2026-09-30')).toBe('2026-Q2');
    expect(lastQuarter('2027-01-05')).toBe('2026-Q4');
  });

  it('gives a quarter’s first and last days, and its months', () => {
    expect(quarterDays('2026-Q3')).toEqual(['2026-07-01', '2026-09-30']);
    expect(quarterDays('2028-Q1')).toEqual(['2028-01-01', '2028-03-31']);
    expect(quarterDays('2026-Q4')).toEqual(['2026-10-01', '2026-12-31']);
    expect(quarterLabel('2026-Q3')).toBe('July–September 2026');
    expect(quarterLabel('2027-Q1')).toBe('January–March 2027');
  });
});

const cite = (sourceId: string, book: 'JHN' | 'ROM', chapter: number, from = 1, to = from) => ({
  sourceId,
  startOrd: verseOrdinal(book, chapter, from),
  endOrd: verseOrdinal(book, chapter, to),
});

describe('grewMost', () => {
  it('counts each section once per chapter, most first, then in canonical order', () => {
    const citations = [
      cite('a', 'ROM', 8, 28),
      cite('a', 'ROM', 8, 38),
      cite('b', 'ROM', 8, 1),
      cite('c', 'JHN', 10, 11),
      cite('d', 'JHN', 10, 9),
      cite('e', 'JHN', 3, 16),
      { sourceId: 'f', startOrd: verseOrdinal('ROM', 7, 24), endOrd: verseOrdinal('ROM', 8, 2) },
    ];
    expect(grewMost(citations)).toEqual([
      { passage: { book: 'ROM', chapter: 8 }, sections: 3 },
      { passage: { book: 'JHN', chapter: 10 }, sections: 2 },
      { passage: { book: 'JHN', chapter: 3 }, sections: 1 },
    ]);
  });

  it('leaves out a citation of more than two chapters', () => {
    const book = {
      sourceId: 'a',
      startOrd: verseOrdinal('ROM', 1, 0),
      endOrd: verseOrdinal('ROM', 16, 999),
    };
    expect(grewMost([book])).toEqual([]);
  });
});
