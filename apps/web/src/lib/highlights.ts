import {
  DEFAULT_TRANSLATION,
  formatPassage,
  type Highlight,
  type Passage,
  passagesOverlap,
  type VerseRef,
} from '@lamp/domain';
import type { Chapter } from './chapters.ts';

/** Verses picked in one chapter: `start` and `end` are verse numbers, `start` ≤ `end`. */
export interface VerseSelection {
  start: number;
  end: number;
}

/** A tap on `verse` starts a selection, or extends one so it includes `verse`. */
export function extendSelection(current: VerseSelection | null, verse: number): VerseSelection {
  if (!current) return { start: verse, end: verse };
  return { start: Math.min(current.start, verse), end: Math.max(current.end, verse) };
}

/** The passage a selection stores: one verse, or a range in this chapter. */
export function selectionPassage(at: Chapter, selection: VerseSelection): Passage {
  const passage: Passage = { book: at.book, chapter: at.chapter, verseStart: selection.start };
  if (selection.end !== selection.start) passage.verseEnd = selection.end;
  return passage;
}

/** A highlight's reference, with the verse text frozen like a chip's snapshot. */
export function highlightRef(at: Chapter, selection: VerseSelection, snapshot: string): VerseRef {
  const passage = selectionPassage(at, selection);
  return {
    ...passage,
    display: formatPassage(passage),
    translation: DEFAULT_TRANSLATION,
    ...(snapshot ? { snapshotText: snapshot } : {}),
  };
}

/**
 * The live highlight of exactly these verses, newest first when more than one was stored. A
 * `verseEnd` equal to `verseStart` is the same passage as one without it.
 */
export function highlightForSelection(
  highlights: readonly Highlight[],
  at: Chapter,
  selection: VerseSelection,
): Highlight | null {
  const key = passageKey(selectionPassage(at, selection));
  return newest(highlights.filter((row) => row.deletedAt === null && passageKey(row.ref) === key));
}

/** The highlight drawn on `verse`: the newest live one whose passage covers it. */
export function highlightForVerse(
  highlights: readonly Highlight[],
  at: Chapter,
  verse: number,
): Highlight | null {
  const versePassage: Passage = { book: at.book, chapter: at.chapter, verseStart: verse };
  return newest(
    highlights.filter((row) => row.deletedAt === null && passagesOverlap(row.ref, versePassage)),
  );
}

function newest(rows: Highlight[]): Highlight | null {
  return (
    rows.toSorted(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id),
    )[0] ?? null
  );
}

/** Book, chapter and verse bounds, so an omitted end and an end equal to the start compare equal. */
function passageKey(p: Passage): string {
  const start = p.verseStart ?? '';
  const end =
    p.verseStart == null || p.verseEnd == null || p.verseEnd === p.verseStart ? '' : p.verseEnd;
  const chapterEnd = p.chapterEnd != null && p.chapterEnd !== p.chapter ? p.chapterEnd : '';
  return `${p.book}.${p.chapter}.${start}.${end}.${chapterEnd}`;
}
