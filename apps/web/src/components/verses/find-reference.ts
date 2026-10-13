import {
  type BookMatch,
  describeParseError,
  matchBooks,
  type ParsedPassage,
  parseReference,
  suggest,
} from '@lamp/domain';

/** One row of the verse suggestions: a passage to insert, or why the typed one can't exist. */
export type ReferenceEntry =
  { kind: 'passage'; ref: ParsedPassage; mappedFrom?: string } | { kind: 'error'; message: string };

export interface ReferenceMatch {
  /** Where the reference starts in the text given. */
  from: number;
  /** The reference as typed. */
  text: string;
  entries: ReferenceEntry[];
}

/** No reference is longer than this ("Second Thessalonians 3:16–4:1" is 31). */
const WINDOW = 48;
/** The list opens once a number is typed: "rom 8", "rom 8:", "rom 8:28–", not "Romans" alone. */
const ENDS_IN_NUMBER = /\d[:.\-–—]*$/u;
const NUMBER_WORD = /^(?:[1-3]|i{1,3}|first|second|third|1st|2nd|3rd)\s+$/iu;
const WORD = /[\p{L}\p{N}]/u;
const KIND_ORDER: Record<BookMatch['kind'], number> = { exact: 0, prefix: 1, fuzzy: 2 };
const EXPLAINED = new Set(['chapter-out-of-range', 'verse-out-of-range', 'range-reversed']);

/**
 * The reference typed just before the cursor, if there is one (wireframes/verses.md "Verse
 * autocomplete"), with what to suggest for it. It ends at the cursor and starts at a word: each
 * word start is tried, and the best book match wins (exact, then the start of a name, then a
 * misspelling). On a tie the longer text wins for an exact or prefix match ("1 Jn 3" over "Jn 3",
 * "Song of Songs 2" over "Songs 2"); a misspelling only takes a book number along ("1 Jhon 3"),
 * so "a romns 8" leaves the "a" alone.
 *
 * Returns null when nothing should show: no number typed yet, no book, or numbers that are wrong
 * in a way not worth explaining (a typo in the middle of a sentence).
 */
export function findReference(before: string): ReferenceMatch | null {
  if (!ENDS_IN_NUMBER.test(before)) return null;
  const offset = Math.max(0, before.length - WINDOW);
  const text = before.slice(offset);
  let best: (ReferenceMatch & { rank: number }) | null = null;
  for (const start of wordStarts(before, offset)) {
    const typed = text.slice(start);
    const found = candidate(typed);
    if (!found) continue;
    const better =
      !best ||
      found.rank < best.rank ||
      // Equal rank: `best` is the longer text. Keep it unless it's a misspelling with more
      // than a book number in front.
      (found.rank === best.rank &&
        found.rank === KIND_ORDER.fuzzy &&
        !NUMBER_WORD.test(best.text.slice(0, best.text.length - typed.length)));
    if (better)
      best = { from: offset + start, text: typed, entries: found.entries, rank: found.rank };
  }
  if (!best) return null;
  const { rank: _, ...match } = best;
  return match;
}

/**
 * The rows for a reference as typed, best first: each book it could be with the numbers typed, or
 * when none fits, why ("Romans has 16 chapters.").
 */
export function referenceEntries(typed: string): ReferenceEntry[] {
  return candidate(typed)?.entries ?? [];
}

function candidate(typed: string): { entries: ReferenceEntry[]; rank: number } | null {
  const book = bookPart(typed);
  if (!book) return null;
  const suggestions = suggest(typed);
  if (suggestions.length > 0) {
    return {
      rank: KIND_ORDER[suggestions[0]!.match],
      entries: suggestions.map(({ ref, mappedFrom }) => ({
        kind: 'passage',
        ref,
        ...(mappedFrom && { mappedFrom }),
      })),
    };
  }
  // Only explain numbers that don't exist in a book that was clearly meant.
  const result = parseReference(typed.replace(/[:.\-–—]+$/u, ''));
  if (result.ok || !EXPLAINED.has(result.error.code)) return null;
  const matches = matchBooks(book);
  if (matches.length !== 1 || matches[0]!.kind === 'fuzzy') return null;
  return {
    rank: KIND_ORDER[matches[0]!.kind],
    entries: [{ kind: 'error', message: describeParseError(result.error) }],
  };
}

/** "1 Jn " of "1 Jn 3:16": the text up to the first digit after a letter, if it has a letter. */
function bookPart(typed: string): string | null {
  const letter = typed.search(/\p{L}/u);
  if (letter === -1) return null;
  const digit = typed.slice(letter).search(/\d/);
  return digit === -1 ? null : typed.slice(0, letter + digit);
}

/** Where each word starts after `offset` (a letter or digit after anything else), longest first. */
function wordStarts(text: string, offset: number): number[] {
  const starts: number[] = [];
  for (let i = offset; i < text.length; i++) {
    const isWord = WORD.test(text[i]!);
    const afterWord = i > 0 && WORD.test(text[i - 1]!);
    if (isWord && !afterWord) starts.push(i - offset);
  }
  return starts;
}
