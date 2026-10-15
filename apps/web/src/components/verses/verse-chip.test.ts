import { describe, expect, it } from 'vitest';
import { chipLabel } from './verse-chip.ts';

describe('chipLabel', () => {
  it('names the passage and the translation, as a button to show the text', () => {
    expect(chipLabel({ display: 'John 10:9', translation: 'BSB' })).toBe(
      'John 10:9, Berean Standard Bible, verse. Show text.',
    );
  });
});
