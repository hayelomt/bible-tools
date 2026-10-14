import type { Highlight } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import {
  extendSelection,
  highlightForSelection,
  highlightForVerse,
  highlightRef,
  selectionPassage,
} from './highlights.ts';

const at = { book: 'JHN' as const, chapter: 10 };

function highlight(partial: Partial<Highlight> & Pick<Highlight, 'id' | 'updatedAt'>): Highlight {
  return {
    createdAt: partial.updatedAt,
    rev: 0,
    deletedAt: null,
    ref: { book: 'JHN', chapter: 10, verseStart: 11, display: 'John 10:11', translation: 'WEB' },
    colour: 'yellow',
    note: null,
    promotedSectionId: null,
    ...partial,
  };
}

describe('extendSelection', () => {
  it('starts at the tapped verse and grows to include the next tap', () => {
    const one = extendSelection(null, 11);
    expect(one).toEqual({ start: 11, end: 11 });
    expect(extendSelection(one, 9)).toEqual({ start: 9, end: 11 });
    expect(extendSelection({ start: 9, end: 11 }, 14)).toEqual({ start: 9, end: 14 });
  });
});

describe('highlight lookup', () => {
  const range = highlight({
    id: 'a',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ref: {
      book: 'JHN',
      chapter: 10,
      verseStart: 9,
      verseEnd: 11,
      display: 'John 10:9–11',
      translation: 'WEB',
    },
    colour: 'yellow',
  });
  const newer = highlight({
    id: 'b',
    updatedAt: '2026-10-02T00:00:00.000Z',
    colour: 'green',
    note: 'the door',
  });

  it('finds the highlight of exactly the selected verses', () => {
    expect(highlightForSelection([range, newer], at, { start: 9, end: 11 })?.id).toBe('a');
    expect(highlightForSelection([range], at, { start: 11, end: 11 })).toBeNull();
    // A stored end equal to the start is still that one verse.
    const doubled = highlight({
      id: 'c',
      updatedAt: '2026-10-03T00:00:00.000Z',
      ref: {
        book: 'JHN',
        chapter: 10,
        verseStart: 11,
        verseEnd: 11,
        display: 'John 10:11',
        translation: 'WEB',
      },
    });
    expect(highlightForSelection([doubled], at, { start: 11, end: 11 })?.id).toBe('c');
  });

  it('paints a verse with the newest highlight that covers it', () => {
    expect(highlightForVerse([range, newer], at, 11)?.colour).toBe('green');
    expect(highlightForVerse([range, newer], at, 9)?.colour).toBe('yellow');
    expect(highlightForVerse([range], at, 12)).toBeNull();
    expect(highlightForVerse([{ ...range, deletedAt: range.updatedAt }], at, 9)).toBeNull();
  });
});

describe('highlightRef', () => {
  it('formats one verse or a range and keeps the snapshot', () => {
    expect(selectionPassage(at, { start: 11, end: 11 })).toEqual({
      book: 'JHN',
      chapter: 10,
      verseStart: 11,
    });
    expect(highlightRef(at, { start: 11, end: 12 }, 'I am the good shepherd.')).toEqual({
      book: 'JHN',
      chapter: 10,
      verseStart: 11,
      verseEnd: 12,
      display: 'John 10:11–12',
      translation: 'WEB',
      snapshotText: 'I am the good shepherd.',
    });
  });
});
