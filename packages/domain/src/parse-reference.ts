import { BOOKS, type Book, type BookCode, bookKey, getBook } from './books.ts';
import { type Passage, type PassageError, checkPassage, formatPassage } from './verse-ref.ts';

/** A passage with its display text, as the parser returns it. */
export interface ParsedPassage extends Passage {
  display: string;
}

export type ParseError =
  | { code: 'empty' }
  | { code: 'syntax'; input: string }
  | { code: 'unknown-book'; book: string }
  | { code: 'ambiguous-book'; book: string; candidates: BookCode[] }
  | { code: 'missing-chapter'; book: BookCode }
  | PassageError;

export type ParseResult = { ok: true; ref: ParsedPassage } | { ok: false; error: ParseError };

export interface BookMatch {
  book: Book;
  /** exact alias, the start of an alias, or a misspelling (edit distance ≤ 2) */
  kind: 'exact' | 'prefix' | 'fuzzy';
}

export interface Suggestion {
  ref: ParsedPassage;
  match: BookMatch['kind'];
}

/**
 * Parses one reference: "Rom 8:28-30", "1 Jn 3", "romns 8", "Rom 8:38–9:5", "Ps 23", "Jude 3".
 * Accepts abbreviations, misspelt names, numbered books written as 1, I or First, chapter-only
 * and chapter ranges, verse ranges, ranges across chapters, `.` for `:` and any dash.
 */
export function parseReference(input: string): ParseResult {
  const split = splitInput(input);
  if (!split.ok) return split;
  const matches = matchBooks(split.book);
  if (matches.length === 0) return fail({ code: 'unknown-book', book: split.book.trim() });
  if (matches.length > 1) {
    const candidates = matches.map((m) => m.book.code);
    return fail({ code: 'ambiguous-book', book: split.book.trim(), candidates });
  }
  return buildPassage(matches[0]!.book, split.numbers, input);
}

/**
 * Completions for a reference being typed, best first: every book the name could be, with the
 * chapter and verses typed so far. A trailing separator ("Rom 8:", "Rom 8:28-") is ignored, and
 * a book alone suggests its first chapter. Candidates whose numbers don't exist are dropped.
 */
export function suggest(input: string, limit = 5): Suggestion[] {
  const split = splitInput(input.replace(/[\s:.,\-–—]+$/u, ''));
  if (!split.ok) return [];
  const suggestions: Suggestion[] = [];
  for (const { book, kind } of matchBooks(split.book)) {
    const numbers = split.numbers || (book.verses.length === 1 ? '' : '1');
    const result = buildPassage(book, numbers, input);
    if (result.ok) suggestions.push({ ref: result.ref, match: kind });
    if (suggestions.length === limit) break;
  }
  return suggestions;
}

/** Explains a parse error in a sentence for the UI. */
export function describeParseError(error: ParseError): string {
  switch (error.code) {
    case 'empty':
      return 'Type a reference, like Romans 8:28.';
    case 'syntax':
      return `“${error.input}” isn’t a reference. Try a form like Romans 8:28–30.`;
    case 'unknown-book':
      return `No book matches “${error.book}”.`;
    case 'ambiguous-book':
      return `“${error.book}” could be ${listNames(error.candidates)}.`;
    case 'missing-chapter':
      return `Add a chapter to ${getBook(error.book).name}.`;
    case 'chapter-out-of-range':
      return `${getBook(error.book).name} has ${error.max} chapters.`;
    case 'verse-out-of-range':
      return `${getBook(error.book).refName} ${error.chapter} has ${error.max} verses.`;
    case 'range-reversed':
      return 'The end of the range comes before its start.';
    case 'invalid-shape':
      return 'That reference isn’t complete.';
  }
}

function listNames(codes: BookCode[]): string {
  // Always two or more names.
  const names = codes.map((code) => getBook(code).name);
  return `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;
}

function fail(error: ParseError): ParseResult {
  return { ok: false, error };
}

type Split = { ok: true; book: string; numbers: string } | { ok: false; error: ParseError };

/** Splits "1 Jn 3:16" into the book ("1 Jn ") and the numbers ("3:16") at the first digit after a letter. */
function splitInput(input: string): Split {
  const text = input.trim();
  if (!text) return { ok: false, error: { code: 'empty' } };
  const letter = text.search(/\p{L}/u);
  if (letter === -1) return { ok: false, error: { code: 'syntax', input: text } };
  const digit = text.slice(letter).search(/\d/);
  const at = digit === -1 ? text.length : letter + digit;
  return { ok: true, book: text.slice(0, at), numbers: text.slice(at) };
}

// chapter[:verse][-(chapter|verse)[:verse]], each verse optionally followed by a or b ("28a").
const NUMBERS = /^(\d+)(?:[:.](\d+)[ab]?)?(?:-(\d+)[ab]?(?:[:.](\d+)[ab]?)?)?$/;

function buildPassage(book: Book, numbers: string, input: string): ParseResult {
  // "Rom 8 28" is not chapter 828: spaces may only sit next to a separator.
  if (/\d\s+\d/.test(numbers)) return fail({ code: 'syntax', input: input.trim() });
  const text = numbers.replaceAll(/\s+/g, '').replaceAll(/[‐‑‒–—−]/gu, '-');
  const single = book.verses.length === 1;
  if (!text) {
    // A one-chapter book on its own is the whole book.
    return single
      ? finish({ book: book.code, chapter: 1 })
      : fail({ code: 'missing-chapter', book: book.code });
  }
  const m = NUMBERS.exec(text);
  if (!m) return fail({ code: 'syntax', input: input.trim() });
  const [a, b, c, d] = m.slice(1).map((n) => (n === undefined ? undefined : Number(n)));
  const first = a!;

  // "Rom 8-9:5": a chapter range can't end on a verse.
  if (b === undefined && d !== undefined) return fail({ code: 'syntax', input: input.trim() });
  const code = book.code;
  // In a one-chapter book, bare numbers are verses: "Jude 3", "Jude 3-5".
  if (single && b === undefined)
    return finish({ book: code, chapter: 1, verseStart: first, verseEnd: c });
  if (b === undefined) return finish({ book: code, chapter: first, chapterEnd: c });
  if (d === undefined) return finish({ book: code, chapter: first, verseStart: b, verseEnd: c });
  return finish({ book: code, chapter: first, verseStart: b, chapterEnd: c, verseEnd: d });
}

/** Drops redundant ends (8:28-28, 8-8, 8:28-8:30 → 8:28-30), checks the passage and formats it. */
function finish(p: Passage): ParseResult {
  const passage: Passage = { book: p.book, chapter: p.chapter };
  if (p.verseStart !== undefined) passage.verseStart = p.verseStart;
  if (p.chapterEnd !== undefined && p.chapterEnd !== p.chapter) passage.chapterEnd = p.chapterEnd;
  if (
    p.verseEnd !== undefined &&
    (passage.chapterEnd !== undefined || p.verseEnd !== p.verseStart)
  ) {
    passage.verseEnd = p.verseEnd;
  }
  const error = checkPassage(passage);
  if (error) return fail(error);
  return { ok: true, ref: { ...passage, display: formatPassage(passage) } };
}

/**
 * Every book a typed name could mean, best first. An exact alias wins outright; otherwise books
 * with an alias starting with the name; otherwise, for names of 4+ letters, the closest
 * misspellings (edit distance ≤ 2 from an alias of 3+ letters). Without a number, "Sam" matches
 * 1 and 2 Samuel, but an unnumbered book wins when there is one ("Jhon" is John, not 1 John).
 */
export function matchBooks(name: string): BookMatch[] {
  const key = bookKey(name);
  const exact = BOOKS.filter((book) => book.aliases.includes(key));
  if (exact.length > 0) return exact.map((book) => ({ book, kind: 'exact' }));

  const num = /^[1-3]/.test(key) ? key.slice(0, 1) : '';
  const stem = key.slice(num.length);
  if (!/^\p{L}/u.test(stem)) return [];
  // The aliases to compare, without the book number; a typed number must match the book's.
  const stemsOf = (book: Book): string[] => {
    if (num && String(book.number) !== num) return [];
    return book.aliases.map((alias) => (book.number ? alias.slice(1) : alias));
  };
  const preferUnnumbered = (items: Ranked[]): Ranked[] => {
    const unnumbered = items.filter((item) => !item.book.number);
    return num || unnumbered.length === 0 ? items : unnumbered;
  };

  const prefixed = BOOKS.flatMap((book) => {
    const lengths = stemsOf(book)
      .filter((s) => s.startsWith(stem))
      .map((s) => s.length);
    return lengths.length > 0 ? [{ book, rank: Math.min(...lengths) }] : [];
  });
  if (prefixed.length > 0) {
    return sortByRank(preferUnnumbered(prefixed)).map((book) => ({ book, kind: 'prefix' }));
  }

  if (stem.length < 4) return [];
  // Distance relative to the alias, so "jhon" is nearer "john" (1 in 4) than "jon" (1 in 3).
  const fuzzy = BOOKS.flatMap((book) => {
    const scores = stemsOf(book)
      .filter((s) => s.length >= 3)
      .map((s) => [editDistance(stem, s), s.length] as const)
      .filter(([distance]) => distance <= 2)
      .map(([distance, length]) => distance / length);
    return scores.length > 0 ? [{ book, rank: Math.min(...scores) }] : [];
  });
  const closest = Math.min(...fuzzy.map((f) => f.rank));
  const nearest = preferUnnumbered(fuzzy.filter((f) => f.rank === closest));
  return sortByRank(nearest).map((book) => ({ book, kind: 'fuzzy' }));
}

interface Ranked {
  book: Book;
  rank: number;
}

/** Lowest rank first (the shortest matching alias, or the closest spelling), then canonical order. */
function sortByRank(items: Ranked[]): Book[] {
  return items
    .toSorted((x, y) => x.rank - y.rank || x.book.index - y.book.index)
    .map((item) => item.book);
}

/** Optimal string alignment distance: Levenshtein plus adjacent transpositions ("Jhon"). */
export function editDistance(a: string, b: string): number {
  const rows: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(rows[i - 1]![j]! + 1, rows[i]![j - 1]! + 1, rows[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, rows[i - 2]![j - 2]! + 1);
      }
      rows[i]![j] = best;
    }
  }
  return rows[a.length]![b.length]!;
}
