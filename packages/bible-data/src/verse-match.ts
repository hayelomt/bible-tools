import {
  type BookCode,
  bookByIndex,
  formatPassage,
  type Passage,
  passagesOverlap,
  verseOrdinal,
} from '@lamp/domain';
import type { BookText } from './book-text.ts';

/** A run of whole verses found in pasted text: where, which passage, and in which translation. */
export interface VerseTextMatch {
  /** Where the first verse's first word starts in the text. */
  from: number;
  /** Where the last verse's last word ends (exclusive). */
  to: number;
  /** The text between, as pasted (verse numbers and headings included). */
  text: string;
  translation: string;
  passage: Passage & { display: string };
  /** Words that differ from the translation's text: 0 for an exact copy. */
  edits: number;
}

/** Words in a row that find a verse: its first four, or the four from its middle. */
const ANCHOR = 4;
/** The fewest words a verse needs to match on its own; shorter ones only extend a run. */
export const MIN_WORDS_ALONE = 6;
/** The most words between two verses of one run: a heading, a verse number's note, a footnote. */
const MAX_GAP = 8;
/**
 * Words allowed to differ: one in twenty (a word an edition since changed). Another translation
 * differs by more: the NIV's John 3:16 is two words from the BSB's.
 */
const allowedEdits = (length: number) => Math.floor(length / 20);
const MAX_WORDS = 1 << 16;

/**
 * Finds whole verses of the BSB and the KJV inside pasted text (F19, M9-04, TECH-DESIGN §9).
 * Verse text is compared word by word, lower case, without accents, punctuation, quotes or
 * numbers, so verse numbers, curly quotes and line breaks from a web page don't matter. Each word
 * is a number in a vocabulary, and each verse's words sit in one typed array, so the index stays
 * small; a verse is found from four words in a row, then aligned allowing one word in ten to
 * differ. Consecutive verses join into a range across headings of up to eight words.
 *
 * Books are added one at a time, so a translation downloaded later can join the index.
 */
export class VerseTextIndex {
  private readonly vocabulary = new Map<string, number>();
  private words = new Uint16Array(1 << 20);
  private wordCount = 0;
  /** Per verse: where its words start, how many, its ordinal and translation. */
  private verseStart = new Int32Array(1 << 15);
  private verseLength = new Uint8Array(1 << 15);
  private verseOrdinal = new Int32Array(1 << 15);
  private verseTranslation = new Uint8Array(1 << 15);
  private verseCount = 0;
  private readonly translations: string[] = [];
  private readonly anchors = new AnchorTable();
  private readonly added = new Set<string>();

  /** How many verses are indexed. */
  get size(): number {
    return this.verseCount;
  }

  /** Bytes held in typed arrays (the vocabulary's strings aren't counted). */
  get bytes(): number {
    return (
      this.words.byteLength +
      this.verseStart.byteLength +
      this.verseLength.byteLength +
      this.verseOrdinal.byteLength +
      this.verseTranslation.byteLength +
      this.anchors.bytes
    );
  }

  /** Whether a translation's book is in the index. */
  has(translation: string, code: BookCode): boolean {
    return this.added.has(`${translation}:${code}`);
  }

  /** Adds a book of a translation; a book already in is left as it is. */
  add(translation: string, code: BookCode, book: BookText): void {
    if (this.has(translation, code)) return;
    this.added.add(`${translation}:${code}`);
    let t = this.translations.indexOf(translation);
    if (t === -1) t = this.translations.push(translation) - 1;
    book.c.forEach((verses, c) => {
      verses.forEach((text, v) => {
        const ids = words(text).map((word) => this.wordId(word.word));
        this.addVerse(t, verseOrdinal(code, c + 1, v + 1), ids);
      });
    });
  }

  /**
   * The runs of whole verses in `text`, in order. Where the same words are two passages (a verse
   * repeated elsewhere, like Proverbs 14:12 and 16:25), a passage among `hints` (the references
   * found in the text) decides, and without one neither is returned.
   */
  match(text: string, hints: readonly Passage[] = []): VerseTextMatch[] {
    const pasted = words(text);
    const ids: Pasted = Object.assign(
      Int32Array.from(pasted, (word) => this.pastedId(word.word)),
      { loose: Uint8Array.from(pasted, (word) => (word.word.length === 1 ? 1 : 0)) },
    );
    const hits = this.seeds(ids);
    const runs = dedupe(hits.map((hit) => this.run(ids, hit)));
    return this.choose(runs, hints)
      .toSorted((a, b) => a.from - b.from)
      .map((run) => {
        const from = pasted[run.from]!.from;
        const to = pasted[run.to - 1]!.to;
        return {
          from,
          to,
          text: text.slice(from, to),
          translation: this.translations[this.verseTranslation[run.first]!]!,
          passage: this.passage(run.first, run.last),
          edits: run.edits,
        };
      });
  }

  private wordId(word: string): number {
    let id = this.vocabulary.get(word);
    if (id === undefined) {
      id = this.vocabulary.size;
      if (id >= MAX_WORDS) throw new Error('The verse index has too many distinct words.');
      this.vocabulary.set(word, id);
    }
    return id;
  }

  /** A pasted word's id: as it is, or without a footnote letter stuck to it ("Him,a" → "hima"). */
  private pastedId(word: string): number {
    const id = this.vocabulary.get(word);
    if (id !== undefined || word.length < 3) return id ?? -1;
    return this.vocabulary.get(word.slice(0, -1)) ?? -1;
  }

  private addVerse(translation: number, ordinal: number, ids: number[]) {
    const v = this.verseCount++;
    if (v >= this.verseStart.length) {
      this.verseStart = grow(this.verseStart, v + 1);
      this.verseLength = grow(this.verseLength, v + 1);
      this.verseOrdinal = grow(this.verseOrdinal, v + 1);
      this.verseTranslation = grow(this.verseTranslation, v + 1);
    }
    if (this.wordCount + ids.length > this.words.length) {
      this.words = grow(this.words, this.wordCount + ids.length);
    }
    this.verseStart[v] = this.wordCount;
    this.verseLength[v] = ids.length;
    this.verseOrdinal[v] = ordinal;
    this.verseTranslation[v] = translation;
    this.words.set(ids, this.wordCount);
    this.wordCount += ids.length;
    if (ids.length < MIN_WORDS_ALONE) return;
    this.anchors.add(anchorKey(ids, 0), v, 0);
    const middle = Math.floor(ids.length / 2);
    if (middle >= ANCHOR) this.anchors.add(anchorKey(ids, middle), v, middle);
  }

  /** Every verse that matches on its own somewhere in the text. */
  private seeds(ids: Pasted): Hit[] {
    const hits: Hit[] = [];
    const tried = new Set<string>();
    for (let p = 0; p + ANCHOR <= ids.length; p++) {
      if (ids.subarray(p, p + ANCHOR).some((id) => id < 0)) continue;
      this.anchors.each(anchorKey(ids, p), (verse, offset) => {
        const start = this.verseStart[verse]! + offset;
        for (let i = 0; i < ANCHOR; i++) if (this.words[start + i] !== ids[p + i]) return;
        const near = p - offset;
        if (tried.has(`${verse}:${near}`)) return;
        tried.add(`${verse}:${near}`);
        const length = this.verseLength[verse]!;
        const slack = allowedEdits(length) + 1;
        const hit = this.align(verse, ids, near - slack, near + length + slack);
        if (hit) hits.push(hit);
      });
    }
    return hits;
  }

  /**
   * The best place for the whole of `verse` among the pasted words in [from, to): its words in
   * order, with skipped words before and after free, and at most one word in ten inserted,
   * dropped or changed in between.
   */
  private align(verse: number, ids: Pasted, from: number, to: number): Hit | null {
    const length = this.verseLength[verse]!;
    if (length === 0) return null;
    const start = this.verseStart[verse]!;
    const a = Math.max(0, from);
    const width = Math.min(ids.length, to) - a;
    if (width <= 0) return null;
    // Edit distance with a free start and end in the pasted words; `origin` follows each cell's
    // first pasted word.
    let cost = new Int32Array(width + 1);
    let origin = Int32Array.from({ length: width + 1 }, (_, j) => j);
    let nextCost = new Int32Array(width + 1);
    let nextOrigin = new Int32Array(width + 1);
    for (let i = 1; i <= length; i++) {
      const word = this.words[start + i - 1]!;
      nextCost[0] = i;
      nextOrigin[0] = 0;
      for (let j = 1; j <= width; j++) {
        const substitute = cost[j - 1]! + (ids[a + j - 1] === word ? 0 : 1);
        const drop = cost[j]! + 1;
        // A footnote letter between words ("love Him,a who") costs nothing.
        const insert = nextCost[j - 1]! + (ids.loose[a + j - 1] ? 0 : 1);
        if (substitute <= drop && substitute <= insert) {
          nextCost[j] = substitute;
          nextOrigin[j] = origin[j - 1]!;
        } else if (drop <= insert) {
          nextCost[j] = drop;
          nextOrigin[j] = origin[j]!;
        } else {
          nextCost[j] = insert;
          nextOrigin[j] = nextOrigin[j - 1]!;
        }
      }
      [cost, nextCost] = [nextCost, cost];
      [origin, nextOrigin] = [nextOrigin, origin];
    }
    let best = -1;
    for (let j = 1; j <= width; j++) {
      if (best === -1 || cost[j]! < cost[best]!) best = j;
    }
    if (best === -1 || cost[best]! > allowedEdits(length)) return null;
    return { verse, from: a + origin[best]!, to: a + best, edits: cost[best]! };
  }

  /** The verse after `verse` in its book and translation, past any it leaves out; -1 at the end. */
  private step(verse: number, direction: 1 | -1): number {
    const book = Math.floor(this.verseOrdinal[verse]! / 1_000_000);
    for (let v = verse + direction; v >= 0 && v < this.verseCount; v += direction) {
      if (this.verseTranslation[v] !== this.verseTranslation[verse]) return -1;
      if (Math.floor(this.verseOrdinal[v]! / 1_000_000) !== book) return -1;
      if (this.verseLength[v]! > 0) return v;
    }
    return -1;
  }

  /** The run a verse starts: the verses after and before it, each within a gap of the last. */
  private run(ids: Pasted, hit: Hit): Run {
    const run: Run = {
      first: hit.verse,
      last: hit.verse,
      from: hit.from,
      to: hit.to,
      edits: hit.edits,
      verses: 1,
    };
    for (let next = this.step(run.last, 1); next !== -1; next = this.step(run.last, 1)) {
      const slack = allowedEdits(this.verseLength[next]!) + 1;
      const found = this.align(
        next,
        ids,
        run.to,
        run.to + MAX_GAP + this.verseLength[next]! + slack,
      );
      if (!found || found.from - run.to > MAX_GAP) break;
      Object.assign(run, {
        last: next,
        to: found.to,
        edits: run.edits + found.edits,
        verses: run.verses + 1,
      });
    }
    for (
      let previous = this.step(run.first, -1);
      previous !== -1;
      previous = this.step(run.first, -1)
    ) {
      const length = this.verseLength[previous]!;
      const slack = allowedEdits(length) + 1;
      const found = this.align(previous, ids, run.from - MAX_GAP - length - slack, run.from);
      if (!found || run.from - found.to > MAX_GAP) break;
      Object.assign(run, {
        first: previous,
        from: found.from,
        edits: run.edits + found.edits,
        verses: run.verses + 1,
      });
    }
    return run;
  }

  /**
   * The runs to return: the most verses first, then the most words, the fewest edits, and the
   * translation added first; none overlapping. Equal runs naming different passages are decided
   * by `hints`, else dropped.
   */
  private choose(runs: Run[], hints: readonly Passage[]): Run[] {
    const rank = (a: Run, b: Run) =>
      b.verses - a.verses ||
      b.to - b.from - (a.to - a.from) ||
      a.edits - b.edits ||
      this.verseTranslation[a.first]! - this.verseTranslation[b.first]!;
    const sorted = runs.toSorted(rank);
    const taken: Run[] = [];
    const chosen: Run[] = [];
    const free = (run: Run) => !taken.some((other) => overlaps(run, other));
    for (const run of sorted) {
      if (!free(run)) continue;
      const rivals = sorted.filter(
        (other) => free(other) && overlaps(run, other) && sameRank(run, other),
      );
      const passages = (list: Run[]) => new Set(list.map((r) => this.passageKey(r)));
      let pick: Run | undefined = run;
      if (passages(rivals).size > 1) {
        const hinted = rivals.filter((r) => {
          const passage = this.passage(r.first, r.last);
          return hints.some((hint) => passagesOverlap(hint, passage));
        });
        pick = passages(hinted).size === 1 ? hinted[0] : undefined;
      }
      taken.push(...rivals);
      if (pick) chosen.push(pick);
    }
    return chosen;
  }

  private passageKey(run: Run): string {
    return `${this.verseOrdinal[run.first]}-${this.verseOrdinal[run.last]}`;
  }

  private passage(first: number, last: number): Passage & { display: string } {
    const [start, end] = [this.verseOrdinal[first]!, this.verseOrdinal[last]!];
    const book = bookByIndex(Math.floor(start / 1_000_000))!.code;
    const chapter = Math.floor(start / 1000) % 1000;
    const chapterEnd = Math.floor(end / 1000) % 1000;
    const [verseStart, verseEnd] = [start % 1000, end % 1000];
    const passage: Passage = {
      book,
      chapter,
      verseStart,
      ...(chapterEnd !== chapter && { chapterEnd }),
      ...((chapterEnd !== chapter || verseEnd !== verseStart) && { verseEnd }),
    };
    return { ...passage, display: formatPassage(passage) };
  }
}

/** The pasted words' ids (-1 for a word not in any verse), and which are a single letter. */
type Pasted = Int32Array & { loose: Uint8Array };

interface Hit {
  verse: number;
  /** The pasted words it covers: [from, to). */
  from: number;
  to: number;
  edits: number;
}

interface Run {
  first: number;
  last: number;
  from: number;
  to: number;
  edits: number;
  verses: number;
}

const sameRank = (a: Run, b: Run) =>
  a.verses === b.verses && a.to - a.from === b.to - b.from && a.edits === b.edits;

const overlaps = (a: Run, b: Run) => a.from < b.to && b.from < a.to;

function dedupe(runs: Run[]): Run[] {
  const seen = new Map<string, Run>();
  for (const run of runs) seen.set(`${run.first}:${run.last}:${run.from}:${run.to}`, run);
  return [...seen.values()];
}

function anchorKey(ids: ArrayLike<number>, at: number): number {
  let hash = 0x811c9dc5;
  for (let i = at; i < at + ANCHOR; i++) hash = Math.imul(hash ^ ids[i]!, 0x01000193);
  return hash | 0;
}

function grow<T extends Int32Array | Uint16Array | Uint8Array>(array: T, need: number): T {
  const next = new (array.constructor as new (length: number) => T)(
    Math.max(need, array.length * 2),
  );
  next.set(array);
  return next;
}

/**
 * Four-word anchors to verses, as an open-addressed hash table in typed arrays: far smaller than
 * a `Map` of arrays for some 120,000 anchors. Anchors with the same key are chained.
 */
class AnchorTable {
  private keys = new Int32Array(1 << 16);
  /** The first entry for each key, plus one; 0 is an empty slot. */
  private heads = new Int32Array(1 << 16);
  private used = 0;
  private verse = new Int32Array(1 << 16);
  private offset = new Uint8Array(1 << 16);
  private next = new Int32Array(1 << 16);
  private entries = 0;

  get bytes(): number {
    return (
      this.keys.byteLength +
      this.heads.byteLength +
      this.verse.byteLength +
      this.offset.byteLength +
      this.next.byteLength
    );
  }

  add(key: number, verse: number, offset: number) {
    if (this.entries >= this.verse.length) {
      this.verse = grow(this.verse, this.entries + 1);
      this.offset = grow(this.offset, this.entries + 1);
      this.next = grow(this.next, this.entries + 1);
    }
    const e = this.entries++;
    this.verse[e] = verse;
    this.offset[e] = offset;
    const slot = this.slot(key);
    if (this.heads[slot] === 0) {
      this.keys[slot] = key;
      this.used++;
    }
    this.next[e] = this.heads[slot]! - 1;
    this.heads[slot] = e + 1;
    if (this.used * 2 > this.keys.length) this.rehash();
  }

  each(key: number, visit: (verse: number, offset: number) => void) {
    for (let e = this.heads[this.slot(key)]! - 1; e !== -1; e = this.next[e]!) {
      visit(this.verse[e]!, this.offset[e]!);
    }
  }

  private slot(key: number): number {
    const mask = this.keys.length - 1;
    // The multiplied key's top bits, as many as the table needs (Fibonacci hashing).
    let slot = Math.imul(key, 0x9e3779b1) >>> Math.clz32(mask);
    while (this.heads[slot] !== 0 && this.keys[slot] !== key) slot = (slot + 1) & mask;
    return slot;
  }

  private rehash() {
    const { keys, heads } = this;
    this.keys = new Int32Array(keys.length * 2);
    this.heads = new Int32Array(keys.length * 2);
    for (let s = 0; s < keys.length; s++) {
      if (heads[s] === 0) continue;
      const slot = this.slot(keys[s]!);
      this.keys[slot] = keys[s]!;
      this.heads[slot] = heads[s]!;
    }
  }
}

interface Word {
  word: string;
  from: number;
  to: number;
}

const folded = new Map<string, string | null>();

/**
 * A character as it's compared: a lower-case letter or two ("æ" → "ae"), "" for an apostrophe
 * (which joins: "God’s" is "gods"), or null for anything else, which separates words. Numbers
 * separate too, so verse numbers drop out.
 */
function fold(char: string): string | null {
  let result = folded.get(char);
  if (result !== undefined) return result;
  if (/['’ʼ‘`´]/u.test(char)) result = '';
  else {
    const plain = char.normalize('NFKD').replaceAll(/\p{M}/gu, '').toLowerCase();
    const spelled = plain.replaceAll('æ', 'ae').replaceAll('œ', 'oe').replaceAll('ß', 'ss');
    result = /^[a-z]+$/u.test(spelled) ? spelled : null;
  }
  folded.set(char, result);
  return result;
}

/** The words of a text as compared, each with where it is. */
export function words(text: string): Word[] {
  const out: Word[] = [];
  let word = '';
  let from = -1;
  let to = -1;
  for (let i = 0; i < text.length;) {
    const code = text.codePointAt(i)!;
    const char = String.fromCodePoint(code);
    const letters = fold(char);
    if (letters === null) {
      if (word) out.push({ word, from, to });
      word = '';
    } else if (letters) {
      if (!word) from = i;
      word += letters;
      to = i + char.length;
    }
    i += char.length;
  }
  if (word) out.push({ word, from, to });
  return out;
}
