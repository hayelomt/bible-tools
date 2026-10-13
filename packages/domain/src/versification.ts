import { type BookCode, verseCount } from './books.ts';
import type { Passage } from './verse-ref.ts';

/**
 * KJV verse numbers that point somewhere else in WEB (the app's text), as [chapter, verse].
 * Found by diffing the eBible.org KJV and WEB USFM (2026-10-13): Romans is the only book whose
 * verse counts differ. WEB prints the doxology at 14:24–26 and keeps 16:25 as an empty verse
 * with a footnote. Matthew 23:13–14 come in the opposite order in WEB, but both numbers exist
 * there, so they follow WEB and are not remapped.
 */
const KJV_TO_WEB: Partial<Record<BookCode, Record<string, readonly [number, number]>>> = {
  ROM: { '16:25': [14, 24], '16:26': [14, 25], '16:27': [14, 26] },
};

/**
 * Moves a passage typed with KJV numbers onto WEB's, or returns undefined when nothing changes.
 * A verse in the table moves ("Rom 16:25–27" → 14:24–26). When only the end of a range is in
 * the table, the range runs to the end of that chapter in WEB instead ("Rom 16:20–27" →
 * 16:20–25, "Rom 1:1–16:27" → 1:1–16:25).
 */
export function kjvToWeb(p: Passage): Passage | undefined {
  const table = KJV_TO_WEB[p.book];
  if (!table || p.verseStart === undefined) return undefined;
  const endChapter = p.chapterEnd ?? p.chapter;
  const endVerse = p.verseEnd ?? p.verseStart;
  // A backwards range stays as typed, so the parser reports it.
  if (endChapter < p.chapter || (endChapter === p.chapter && endVerse < p.verseStart))
    return undefined;

  const start = table[`${p.chapter}:${p.verseStart}`];
  const end = table[`${endChapter}:${endVerse}`];
  const [c1, v1] = start ?? [p.chapter, p.verseStart];
  const [c2, v2] =
    start && end
      ? end
      : end
        ? [endChapter, verseCount(p.book, endChapter)]
        : [endChapter, endVerse];
  if (c1 === p.chapter && v1 === p.verseStart && c2 === endChapter && v2 === endVerse)
    return undefined;

  const mapped: Passage = { book: p.book, chapter: c1, verseStart: v1 };
  if (c2 !== c1) mapped.chapterEnd = c2;
  if (c2 !== c1 || v2 !== v1) mapped.verseEnd = v2;
  return mapped;
}
