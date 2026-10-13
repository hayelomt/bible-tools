import { afterEach, describe, expect, it } from 'vitest';
import { FIRST_POSITION, readingPosition, rememberPosition } from './reading-position.ts';

const KEY = 'lamp.readingPosition';

describe('reading position', () => {
  afterEach(() => localStorage.clear());

  it('starts at John 1', () => {
    expect(readingPosition()).toEqual(FIRST_POSITION);
  });

  it('reopens where it was left', () => {
    rememberPosition({ book: 'PSA', chapter: 119, verse: 105 });
    expect(readingPosition()).toEqual({ book: 'PSA', chapter: 119, verse: 105 });
  });

  it('ignores a stored place that is unreadable or not in the Bible', () => {
    for (const stored of [
      '{',
      '"JHN"',
      JSON.stringify({ book: 'XYZ', chapter: 1, verse: 1 }),
      JSON.stringify({ book: 'JUD', chapter: 2, verse: 1 }),
      JSON.stringify({ book: 'JHN', chapter: 3, verse: 37 }),
      JSON.stringify({ book: 'JHN', chapter: 3 }),
    ]) {
      localStorage.setItem(KEY, stored);
      expect(readingPosition()).toEqual(FIRST_POSITION);
    }
  });
});
