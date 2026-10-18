import { chapterCount } from './books.ts';
import { type OrdinalRange, type Passage, passageRange, rangesOverlap } from './verse-ref.ts';

/**
 * The compile view's query (F22, TECH-DESIGN §4.1, wireframes/thinking.md "Commentary"): the notes
 * citing a passage, grouped under the passage each one cites, as one document in canonical order.
 * Pure over what the caller read; the web app reads the rows (`apps/web/src/search/compile.ts`).
 */

/** A note that cites verses: what it is, the passages its chips cite, and its lesson's date. */
export interface CompileSource<T> {
  item: T;
  /** Every passage it cites, in any order, repeats included. */
  refs: readonly Passage[];
  /** Its lesson's date, `YYYY-MM-DD`. */
  date: string;
}

/**
 * Where a note citing several passages in the scope goes (M10-03): under `each` of them in full,
 * or in full under the first `once`, with a pointer to it under the others.
 */
export type SeveralPassages = 'each' | 'once';

export interface CompileEntry<T> {
  item: T;
  /** The other groups it's under, in their order: "Also under Romans 8:38". */
  also: Passage[];
  /** With `once`, in a group after its first: the group it's shown in, as a pointer. */
  shownUnder: Passage | null;
}

/** The notes citing one passage: a chip's exact range, whatever its translation. */
export interface CompileGroup<T> {
  passage: Passage;
  range: OrdinalRange;
  entries: CompileEntry<T>[];
}

/**
 * The groups of notes citing `scope`: one per passage cited that overlaps it, ordered by its first
 * verse (then its last, so "Romans 8:28" comes before "Romans 8:28–30"). In a group, notes are by
 * date, oldest first, so it reads like a commentary that grew over time; on the same date they
 * keep the order given (the lesson's own order, from the caller). A note citing several passages
 * in the scope is under each, or once, as `several` says; one citing the same passage twice is
 * under it once.
 */
export function compile<T>(
  scope: Passage,
  sources: readonly CompileSource<T>[],
  several: SeveralPassages = 'each',
): CompileGroup<T>[] {
  const within = passageRange(scope);
  const groups = new Map<string, { passage: Passage; range: OrdinalRange; members: number[] }>();
  // Each source's groups, by key, in the order they end up in.
  const cited: string[][] = [];

  sources.forEach((source, index) => {
    const keys = new Set<string>();
    for (const ref of source.refs) {
      const range = passageRange(ref);
      if (!rangesOverlap(range, within)) continue;
      const key = `${range[0]}-${range[1]}`;
      if (keys.has(key)) continue;
      keys.add(key);
      let group = groups.get(key);
      if (!group) {
        group = { passage: passageOf(ref), range, members: [] };
        groups.set(key, group);
      }
      group.members.push(index);
    }
    cited.push([...keys]);
  });

  const ordered = [...groups.entries()].toSorted(
    ([, a], [, b]) => a.range[0] - b.range[0] || a.range[1] - b.range[1],
  );
  const position = new Map(ordered.map(([key], i) => [key, i]));
  const passageAt = (key: string) => groups.get(key)!.passage;
  for (const keys of cited) keys.sort((a, b) => position.get(a)! - position.get(b)!);

  return ordered.map(([key, { passage, range, members }]) => ({
    passage,
    range,
    entries: members
      .toSorted((a, b) => sources[a]!.date.localeCompare(sources[b]!.date) || a - b)
      .map((index) => {
        const keys = cited[index]!;
        const first = keys[0]!;
        return {
          item: sources[index]!.item,
          also: keys.filter((k) => k !== key).map(passageAt),
          shownUnder: several === 'once' && first !== key ? passageAt(first) : null,
        };
      }),
  }));
}

/** The passage alone, without a chip's display, translation and text (or a node's null fields). */
function passageOf(ref: Passage): Passage {
  const passage: Passage = { book: ref.book, chapter: ref.chapter };
  if (ref.verseStart != null) passage.verseStart = ref.verseStart;
  if (ref.chapterEnd != null) passage.chapterEnd = ref.chapterEnd;
  if (ref.verseEnd != null) passage.verseEnd = ref.verseEnd;
  return passage;
}

/** What the compile view's scope control offers for a passage. */
export interface CompileScopes {
  /** The passage itself: a verse, a range, or a chapter (then the same as `chapter`). */
  passage: Passage;
  /** Its chapter, or chapters ("Romans 7–8" for Romans 7:24–8:2). */
  chapter: Passage;
  /** Its whole book, as every chapter of it. */
  book: Passage;
}

export function compileScopes(passage: Passage): CompileScopes {
  const own = passageOf(passage);
  const chapter: Passage = { book: own.book, chapter: own.chapter };
  if (own.chapterEnd != null) chapter.chapterEnd = own.chapterEnd;
  const chapters = chapterCount(own.book);
  const book: Passage = { book: own.book, chapter: 1 };
  if (chapters > 1) book.chapterEnd = chapters;
  return { passage: own, chapter, book };
}

/** Whether a passage is a whole book: every chapter of it. */
export function isWholeBook(passage: Passage): boolean {
  const chapters = chapterCount(passage.book);
  return (
    passage.chapter === 1 &&
    passage.verseStart == null &&
    (chapters === 1 ? passage.chapterEnd == null : passage.chapterEnd === chapters)
  );
}
