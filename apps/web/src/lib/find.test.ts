import { describe, expect, it } from 'vitest';
import { matchOffsets } from './find.ts';

describe('matchOffsets', () => {
  it('finds every place, ignoring case', () => {
    expect(matchOffsets('The LORD is my shepherd; the lord', 'lord')).toEqual([4, 29]);
  });

  it('matches straight quotes to curly ones', () => {
    expect(matchOffsets('the shepherd’s voice', "shepherd's")).toEqual([4]);
    expect(matchOffsets('he said, “Peace”', '"peace"')).toEqual([9]);
  });

  it('counts a repeat once, not overlapping', () => {
    expect(matchOffsets('aaaa', 'aa')).toEqual([0, 2]);
  });

  it('finds nothing for nothing', () => {
    expect(matchOffsets('text', '')).toEqual([]);
    expect(matchOffsets('text', 'grace')).toEqual([]);
  });

  it('keeps offsets when lower case would change the length', () => {
    expect(matchOffsets('İ grace', 'grace')).toEqual([2]);
  });
});
