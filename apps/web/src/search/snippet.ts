import { normaliseTerm } from './text-index.ts';

/** A run of a snippet; `match` runs show in bold. */
export interface Segment {
  text: string;
  match: boolean;
}

/** Words as MiniSearch splits them: between spaces and punctuation. */
const WORD = /[^\n\r\p{Z}\p{P}]+/gu;

/**
 * The part of `text` around its first matching word, with every matching word marked
 * (wireframes/search.md: "…the same **shepherd** in Psalm 23…"). `terms` are the indexed words
 * a search matched. About `context` characters show on each side of the first match.
 */
export function snippet(text: string, terms: readonly string[], context = 60): Segment[] {
  const flat = text.replace(/\s+/g, ' ').trim();
  const wanted = new Set(terms);
  const words = [...flat.matchAll(WORD)].map((m) => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  const matches = words.filter((w) => wanted.has(normaliseTerm(flat.slice(w.start, w.end))));
  const first = matches[0];

  // Start and end on a word boundary, so no word shows cut in half.
  let from = 0;
  let to = flat.length;
  if (first && first.start > context) {
    from = words.find((w) => w.start >= first.start - context)?.start ?? first.start;
  }
  if (to - from > context * 3) {
    const limit = from + context * 3;
    to = words.findLast((w) => w.end <= limit && w.end > (first?.end ?? 0))?.end ?? limit;
  }

  const segments: Segment[] = [];
  let at = from;
  for (const m of matches) {
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
