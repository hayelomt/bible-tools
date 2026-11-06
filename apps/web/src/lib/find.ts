/**
 * Quick find (wireframes/reader.md "Quick find"): the matches for a word in what's on the screen.
 * Nothing is added to the text. Words are marked with the CSS Custom Highlight API, so an editor's
 * DOM stays as it is; a browser without it still counts and scrolls to them.
 */

/** A word in the text, or an element holding one: a field's value, or drawn text (`drawText`). */
export type FindMatch = Range | HTMLElement;

/** Same length as `text`, so an offset in it is an offset in the text. */
function fold(text: string): string {
  const lower = text.toLowerCase();
  const folded = lower.length === text.length ? lower : text;
  return folded.replaceAll(/[‘’]/gu, "'").replaceAll(/[“”]/gu, '"').replaceAll(/\s/gu, ' ');
}

/** Where `query` starts in `text`, ignoring case and the shape of quotes. */
export function matchOffsets(text: string, query: string): number[] {
  const needle = fold(query);
  if (!needle) return [];
  const haystack = fold(text);
  const offsets: number[] = [];
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    offsets.push(at);
  }
  return offsets;
}

/** Controls, and what's only for a screen reader or hidden: not the text being read. */
const SKIPPED = 'button, a[data-slot="button"], [role="menu"], [aria-hidden="true"], .sr-only';
const BLOCK = 'p, li, h1, h2, h3, h4, blockquote, div';
/** A lesson's title and takeaways are fields, and a preview's verses are drawn. */
const WHOLE = 'textarea, [data-slot="lesson-title-input"], span[data-text]';

/** The text nodes of one block, read as one line so a word can cross bold or a verse's end. */
interface Run {
  block: Element | null;
  nodes: Text[];
}

function rangesIn({ nodes }: Run, query: string): Range[] {
  const text = nodes.map((node) => node.data).join('');
  /** The node and offset at `at`; the end of a word stays in the node it ends in. */
  const locate = (at: number, end: boolean): [Text, number] => {
    let left = at;
    for (const node of nodes) {
      if (left < node.length || (end && left === node.length)) return [node, left];
      left -= node.length;
    }
    const last = nodes.at(-1)!;
    return [last, last.length];
  };
  return matchOffsets(text, query).map((start) => {
    const range = document.createRange();
    range.setStart(...locate(start, false));
    range.setEnd(...locate(start + query.length, true));
    return range;
  });
}

function matchesIn(root: Element, query: string): FindMatch[] {
  const matches: FindMatch[] = [];
  let run: Run = { block: null, nodes: [] };
  const flush = () => {
    if (run.nodes.length > 0) matches.push(...rangesIn(run, query));
    run = { block: null, nodes: [] };
  };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!(node instanceof Element)) return NodeFilter.FILTER_ACCEPT;
      if (node.matches(SKIPPED)) return NodeFilter.FILTER_REJECT;
      return node.checkVisibility?.() === false
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node instanceof Text) {
      const block = node.parentElement?.closest(BLOCK) ?? null;
      if (block !== run.block) flush();
      run.block = block;
      run.nodes.push(node);
    } else if (node instanceof HTMLElement && node.matches(WHOLE)) {
      flush();
      const text = 'value' in node ? String(node.value) : (node.dataset.text ?? '');
      // One match for a verse or field however often it holds the word: it's marked as a whole.
      if (matchOffsets(text, query).length > 0) matches.push(node);
    }
  }
  flush();
  return matches;
}

/** The matches for `query` in the screen's text (`data-find-root`), in reading order. */
export function findOnScreen(query: string): FindMatch[] {
  if (!query) return [];
  return [...document.querySelectorAll('[data-find-root]')].flatMap((root) =>
    matchesIn(root, query),
  );
}

const MATCH = 'lamp-find';
const CURRENT = 'lamp-find-current';
let marked: HTMLElement[] = [];

/** Takes the marks off every match. */
export function clearMatches() {
  for (const element of marked) delete element.dataset.find;
  marked = [];
  if (typeof Highlight === 'undefined') return;
  CSS.highlights.delete(MATCH);
  CSS.highlights.delete(CURRENT);
}

/** Marks the matches, the one at `current` apart from the rest. */
export function paintMatches(matches: readonly FindMatch[], current: number) {
  clearMatches();
  marked = matches.filter((match) => match instanceof HTMLElement);
  for (const element of marked) element.dataset.find = 'match';
  const active = matches[current];
  if (active instanceof HTMLElement) active.dataset.find = 'current';
  if (typeof Highlight === 'undefined') return;
  const ranges = matches.filter((match) => match instanceof Range);
  CSS.highlights.set(MATCH, new Highlight(...ranges));
  if (active instanceof Range) CSS.highlights.set(CURRENT, new Highlight(active));
}

/** How far from the window's edges a match counts as in view: clear of the bars over the text. */
const EDGE_PX = 96;

/** Scrolls a match into view, a third of the way down what can be seen above any keyboard. */
export function showMatch(match: FindMatch) {
  const { top, bottom } = match.getBoundingClientRect();
  const height = window.visualViewport?.height ?? window.innerHeight;
  if (top >= EDGE_PX && bottom <= height - EDGE_PX) return;
  window.scrollBy({ top: top - height / 3, behavior: 'instant' });
}
