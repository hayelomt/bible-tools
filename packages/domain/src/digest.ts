import { bookByIndex } from './books.ts';
import type { Passage } from './verse-ref.ts';

/**
 * The quarterly digest (F32, M12-07): which quarter it's for, and what's counted in it that is
 * worked out from verses. The web app reads the rows and writes the draft.
 */

/** A quarter, as `lastDigestQuarter` stores it: "2026-Q3". */
export type Quarter = `${number}-Q${1 | 2 | 3 | 4}`;

/** The quarter a date is in. */
export function quarterOf(date: string): Quarter {
  return `${Number(date.slice(0, 4))}-Q${Math.ceil(Number(date.slice(5, 7)) / 3) as 1 | 2 | 3 | 4}`;
}

/** The quarter before the one `date` is in: the last to have ended. */
export function lastQuarter(date: string): Quarter {
  const [year, q] = [Number(date.slice(0, 4)), Math.ceil(Number(date.slice(5, 7)) / 3)];
  return q === 1 ? `${year - 1}-Q4` : `${year}-Q${(q - 1) as 1 | 2 | 3}`;
}

/** A quarter's first and last days: ["2026-07-01", "2026-09-30"]. */
export function quarterDays(quarter: Quarter): readonly [first: string, last: string] {
  const year = Number(quarter.slice(0, 4));
  const q = Number(quarter.slice(-1));
  const first = `${year}-${String(q * 3 - 2).padStart(2, '0')}-01`;
  const end = new Date(Date.UTC(year, q * 3, 0)).toISOString().slice(0, 10);
  return [first, end];
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "July–September 2026". */
export function quarterLabel(quarter: Quarter): string {
  const q = Number(quarter.slice(-1));
  return `${MONTHS[q * 3 - 3]}–${MONTHS[q * 3 - 1]} ${quarter.slice(0, 4)}`;
}

/** How many of the commentaries that grew most the digest names. */
export const GREW_SHOWN = 3;

/** A chapter's commentary, and how many sections it gained. */
export interface Grown {
  passage: Passage;
  sections: number;
}

/**
 * The commentaries that grew most (F32): each chapter by the sections that cite it, a section
 * counted once in each chapter it cites however often. A citation over more than two chapters (a
 * book) is left out, as for "Repeated verse". Most sections first, then in canonical order.
 */
export function grewMost(
  citations: readonly { sourceId: string; startOrd: number; endOrd: number }[],
  limit = GREW_SHOWN,
): Grown[] {
  const chapters = new Map<number, Set<string>>();
  for (const { sourceId, startOrd, endOrd } of citations) {
    const [first, last] = [Math.floor(startOrd / 1000), Math.floor(endOrd / 1000)];
    if (last - first > 1 || Math.floor(first / 1000) !== Math.floor(last / 1000)) continue;
    for (let chapter = first; chapter <= last; chapter++) {
      let sections = chapters.get(chapter);
      if (!sections) chapters.set(chapter, (sections = new Set()));
      sections.add(sourceId);
    }
  }
  return [...chapters]
    .toSorted(([a, x], [b, y]) => y.size - x.size || a - b)
    .slice(0, limit)
    .flatMap(([chapter, sections]) => {
      const book = bookByIndex(Math.floor(chapter / 1000));
      return book
        ? [{ passage: { book: book.code, chapter: chapter % 1000 }, sections: sections.size }]
        : [];
    });
}
