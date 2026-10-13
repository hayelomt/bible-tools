import type { BookText } from '@lamp/bible-data';
import { describe, expect, it } from 'vitest';
import { snapshotText } from './bible.ts';

// Acts 8 in miniature: verse 3 is one WEB leaves out.
const BOOK: BookText = {
  c: [[], [], [], [], [], [], [], ['One.', 'Two.', '', 'Four.']],
  n: { '8:3': 'TR adds a verse.' },
};

describe('snapshotText', () => {
  it('joins the verses of the passage', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 1, verseEnd: 2 })).toBe(
      'One. Two.',
    );
  });

  it('skips a verse left out in a range', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 2, verseEnd: 4 })).toBe(
      'Two. Four.',
    );
  });

  it('gives the footnote, marked, for a verse left out on its own', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 3 })).toBe(
      '[Not in WEB: TR adds a verse.]',
    );
  });
});
