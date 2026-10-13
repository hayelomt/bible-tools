import { normaliseTerm } from './text-index.ts';

/** A run of a snippet; `match` runs show in bold. */
export interface Segment {
  text: string;
  match: boolean;
}

/** Words as MiniSearch splits them: between spaces and punctuation. */
const WORD = /[^\n\r\p{Z}\p{P}]+/gu;

interface Span {
  start: number;
  end: number;
}

const flatten = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * The part of `text` around its first matching word, with every matching word marked
 * (wireframes/search.md: "…the same **shepherd** in Psalm 23…"). `terms` are the indexed words
 * a search matched. About `context` characters show on each side of the first match.
 */
export function snippet(text: string, terms: readonly string[], context = 60): Segment[] {
  const flat = flatten(text);
  const wanted = new Set(terms);
  const matches = words(flat).filter((w) => wanted.has(normaliseTerm(flat.slice(w.start, w.end))));
  return cut(flat, matches, context);
}

/**
 * The part of `text` around the first of `phrases`, each marked where it appears, in order (the
 * verse index: the text around a section's verse chips).
 */
export function around(text: string, phrases: readonly string[], context = 60): Segment[] {
  const flat = flatten(text);
  const marks: Span[] = [];
  let from = 0;
  for (const phrase of phrases) {
    const start = flat.indexOf(phrase, from);
    if (start === -1) continue;
    marks.push({ start, end: start + phrase.length });
    from = start + phrase.length;
  }
  return cut(flat, marks, context);
}

const words = (flat: string): Span[] =>
  [...flat.matchAll(WORD)].map((m) => ({ start: m.index, end: m.index + m[0].length }));

/** `flat` from about `context` characters before the first mark, with the marks marked. */
function cut(flat: string, marks: Span[], context: number): Segment[] {
  const all = words(flat);
  const first = marks[0];

  // Start and end on a word boundary, so no word shows cut in half.
  let from = 0;
  let to = flat.length;
  if (first && first.start > context) {
    from = all.find((w) => w.start >= first.start - context)?.start ?? first.start;
  }
  if (to - from > context * 3) {
    const limit = from + context * 3;
    to = all.findLast((w) => w.end <= limit && w.end > (first?.end ?? 0))?.end ?? limit;
  }

  const segments: Segment[] = [];
  let at = from;
  for (const m of marks) {
    if (m.start < from || m.end > to) continue;
    if (m.start > at) segments.push({ text: flat.slice(at, m.start), match: false });
    segments.push({ text: flat.slice(m.start, m.end), match: true });
    at = m.end;
  }
  if (at < to) segments.push({ text: flat.slice(at, to), match: false });
  if (from > 0) segments.unshift({ text: '…', match: false });
  if (to < flat.length) segments.push({ text: '…', match: false });
  return segments;
}
