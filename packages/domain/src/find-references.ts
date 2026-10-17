import { type Book, bookKey, getBook } from './books.ts';
import { matchBooks, type ParsedPassage, parseReference } from './parse-reference.ts';

/** A reference found in free text: where it is, as written, and the passage it names. */
export interface FoundReference {
  /** Where it starts in the text. */
  from: number;
  /** Where it ends (exclusive). */
  to: number;
  /** As written: "Rom. 8:28", or "31–32" for a later part of a list. */
  text: string;
  ref: ParsedPassage;
}

/**
 * Abbreviations that are also English words or common short forms ("Is", "Am", "Job"). In free
 * text they count only with a verse ("Is 53:5"), never as a chapter alone ("it Is 3 o'clock").
 */
const WORDLIKE = new Set([
  'is', 'am', 'ac', 'ex', 'la', 'ho', 'na', 'ob', 'co', 'pp', 'pm', 're', 'job', 'mr', 'es', 'ne',
  'de', 'ge', 'le', 'nu', 'pe', 'ti', 'jo',
]); // prettier-ignore

/** The book number in front of a name: "1", "2nd", "II", "First". */
const ORDINAL = /^(?:[1-3]|1st|2nd|3rd|i{1,3}|first|second|third)\.?$/iu;
/** A word of a book name, or its number, perhaps abbreviated with a full stop. */
const WORD = /[\p{L}\p{N}]+\.?/uy;
/** Spaces between the words of a name, or between the name and the numbers; not a line break. */
const GAP = /[^\S\n]+/uy;
/** chapter[:verse][-(chapter|verse)[:verse]], each verse perhaps followed by a or b ("28a"). */
const NUMBERS = /\d+(?:[:.]\d+[ab]?)?(?:[^\S\n]*[-‐‑‒–—−][^\S\n]*\d+[ab]?(?:[:.]\d+[ab]?)?)?/uy;
/** Between the parts of a list: "Rom 8:28, 31; 9:1". */
const LIST_SEPARATOR = /[^\S\n]*([,;])[^\S\n]*/uy;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
/** The most words a book name takes, its number included: "1 Song of Solomon" has four. */
const MAX_WORDS = 4;

/**
 * Every verse reference in a block of free text, in order, with its span (F19, M9-03). Built for
 * pasted prose, so it's stricter than the chip autocomplete (decided 2026-10-17):
 * - The book is a full name or a listed abbreviation (`matchBooks`' exact matches), never a
 *   misspelling or the start of a name, and starts with a capital: "Rom 8:28", "1 Cor 13", "Song of
 *   Songs 2:4", but not "romans 8:28".
 * - Abbreviations that are English words ("Is", "Am", "Job") need a verse.
 * - Numbers that don't exist ("John 30") aren't a reference.
 * - A list after a reference continues it: after a comma a number is a verse in the same chapter,
 *   after a semicolon a chapter of the same book, and `chapter:verse` is in the same book either
 *   way ("Romans 8:28, 31–32; 9:1" is three references).
 */
export function findReferences(text: string): FoundReference[] {
  const found: FoundReference[] = [];
  let at = 0;
  while (at < text.length) {
    const start = nextWordStart(text, at);
    if (start === -1) break;
    const match = referenceAt(text, start);
    if (!match) {
      at = wordEnd(text, start);
      continue;
    }
    found.push(match.found);
    at = match.found.to;
    for (let part = continuation(text, at, match); part; part = continuation(text, at, part)) {
      found.push(part.found);
      at = part.found.to;
    }
  }
  return found;
}

interface Match {
  found: FoundReference;
  book: Book;
}

/** The reference whose book name starts at `start`, the longest name first. */
function referenceAt(text: string, start: number): Match | null {
  const words = wordsFrom(text, start);
  for (let count = words.length; count >= 1; count--) {
    const name = text.slice(start, words[count - 1]!);
    const book = bookNamed(name);
    if (!book) continue;
    // "said John. 3 days later": a full stop after a whole name ends a sentence.
    if (name.endsWith('.') && bookKey(name) === bookKey(book.name)) continue;
    const numbersAt = afterGap(text, words[count - 1]!, name.endsWith('.'));
    const numbers = numbersAt === -1 ? null : numbersFrom(text, numbersAt);
    if (!numbers) continue;
    if (WORDLIKE.has(bookKey(name).replace(/^[1-3]/u, '')) && !/[:.]\d/u.test(numbers)) continue;
    const result = parseReference(`${book.name} ${numbers}`);
    if (!result.ok) continue;
    const to = numbersAt + numbers.length;
    return { book, found: { from: start, to, text: text.slice(start, to), ref: result.ref } };
  }
  return null;
}

/** The next part of a list after `previous`, which ends at `at`. */
function continuation(text: string, at: number, previous: Match): Match | null {
  LIST_SEPARATOR.lastIndex = at;
  const separator = LIST_SEPARATOR.exec(text);
  if (!separator) return null;
  const from = at + separator[0].length;
  // "Romans 8:28, 1 Corinthians 13": a new book, found on its own.
  if (referenceAt(text, from)) return null;
  const numbers = numbersFrom(text, from);
  if (!numbers) return null;

  const { book } = previous;
  const { ref } = previous.found;
  let input: string;
  if (/[:.]\d/u.test(numbers.split(/[-‐‑‒–—−]/u)[0]!)) input = numbers;
  else if (separator[1] === ',' && ref.verseStart !== undefined) {
    input = `${ref.chapterEnd ?? ref.chapter}:${numbers}`;
  } else input = numbers;
  const result = parseReference(`${getBook(book.code).name} ${input}`);
  if (!result.ok) return null;
  const to = from + numbers.length;
  return { book, found: { from, to, text: text.slice(from, to), ref: result.ref } };
}

/** The one book a name means exactly, written with a capital; null for anything else. */
function bookNamed(name: string): Book | null {
  const words = name.split(/\s+/u);
  // The name after its number, which may be joined to it ("1Cor").
  const rest = words.length > 1 && ORDINAL.test(words[0]!) ? words.slice(1) : words;
  rest[0] = rest[0]!.replace(/^[1-3]/u, '');
  if (!/^\p{Lu}/u.test(rest[0])) return null;
  // A number with no name ("1 3:16") or a name with numbers inside isn't a book.
  if (rest.some((word) => /\d/u.test(word))) return null;
  const matches = matchBooks(name);
  return matches.length === 1 && matches[0]!.kind === 'exact' ? matches[0]!.book : null;
}

/** Where each of up to `MAX_WORDS` words from `start` ends, each after a gap on the same line. */
function wordsFrom(text: string, start: number): number[] {
  const ends: number[] = [];
  let at = start;
  while (ends.length < MAX_WORDS) {
    WORD.lastIndex = at;
    const word = WORD.exec(text);
    if (!word) break;
    ends.push(at + word[0].length);
    const next = afterGap(text, at + word[0].length, word[0].endsWith('.'));
    if (next === -1) break;
    at = next;
  }
  return ends;
}

/** Where the text goes on after spaces at `at`; -1 without any, unless a full stop came before. */
function afterGap(text: string, at: number, stopBefore: boolean): number {
  GAP.lastIndex = at;
  const gap = GAP.exec(text);
  if (gap) return at + gap[0].length;
  return stopBefore ? at : -1;
}

/** The numbers at `at`, if they end there: "8:28" but not "8:28th" or "2019a". */
function numbersFrom(text: string, at: number): string | null {
  NUMBERS.lastIndex = at;
  const numbers = NUMBERS.exec(text)?.[0];
  if (!numbers) return null;
  const next = text[at + numbers.length];
  return next && LETTER_OR_DIGIT.test(next) ? null : numbers;
}

/** The next position at or after `at` where a word starts (a letter or digit after anything else). */
function nextWordStart(text: string, at: number): number {
  for (let i = at; i < text.length; i++) {
    if (LETTER_OR_DIGIT.test(text[i]!) && (i === 0 || !LETTER_OR_DIGIT.test(text[i - 1]!))) {
      return i;
    }
  }
  return -1;
}

function wordEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length && LETTER_OR_DIGIT.test(text[i]!)) i++;
  return i;
}
