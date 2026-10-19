import { BOOK_CODES, type BookCode, type Lesson, type Tag } from '@lamp/domain';
import { db as appDb, type LampDb } from './db.ts';

/**
 * The theme map (F31, wireframes/reflection.md "Theme map"): tags against months and against the
 * books of the Bible, as heat grids from local data, so it works offline. A cell counts what the
 * tag page lists (decided in M12-03): the tag's sections and lessons, a month by the lesson's
 * date, a book by a section's verse chips or a lesson's main passages, as the verse index does.
 */

/** Something with a tag: a section, or a lesson tagged as a whole. */
export interface TaggedItem {
  tagId: string;
  kind: 'lesson' | 'section';
  id: string;
  lessonId: string;
  /** The lesson's date. */
  date: string;
  /** The books it cites, each once. */
  books: readonly BookCode[];
}

/** How many months the month view covers, this one included. */
export const MONTHS = 24;

/** One tag's row: a count per column, and its total. */
export interface ThemeRow {
  tag: Tag;
  cells: number[];
  /** The tag's notes in the columns, each once however many columns it's in. */
  total: number;
}

/** The last `count` months to `today`'s, oldest first, as `2026-10`. */
export function lastMonths(today: string, count = MONTHS): string[] {
  const end = Number(today.slice(0, 4)) * 12 + Number(today.slice(5, 7)) - 1;
  return Array.from({ length: count }, (_, i) => {
    const month = end - count + 1 + i;
    return `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, '0')}`;
  });
}

/**
 * The rows of a grid: each tag with notes in the columns, by how often it's used there, then by
 * name. `columnsOf` gives the columns an item counts in.
 */
function rowsOf(
  tags: readonly Tag[],
  items: readonly TaggedItem[],
  columns: readonly string[],
  columnsOf: (item: TaggedItem) => readonly string[],
): ThemeRow[] {
  const index = new Map(columns.map((column, i) => [column, i]));
  const rows = new Map<string, ThemeRow>();
  for (const tag of tags) rows.set(tag.id, { tag, cells: columns.map(() => 0), total: 0 });
  for (const item of items) {
    const row = rows.get(item.tagId);
    if (!row) continue;
    let counted = false;
    for (const column of columnsOf(item)) {
      const i = index.get(column);
      if (i === undefined) continue;
      row.cells[i]!++;
      counted = true;
    }
    if (counted) row.total++;
  }
  return [...rows.values()]
    .filter((row) => row.total > 0)
    .toSorted((a, b) => b.total - a.total || a.tag.name.localeCompare(b.tag.name));
}

/** Tags by month for the last `MONTHS` months (M12-03). */
export const byMonth = (tags: readonly Tag[], items: readonly TaggedItem[], months: string[]) =>
  rowsOf(tags, items, months, (item) => [item.date.slice(0, 7)]);

/** Tags by book across the whole Bible, the 66 in canonical order (M12-04). */
export const byBook = (tags: readonly Tag[], items: readonly TaggedItem[]) =>
  rowsOf(tags, items, BOOK_CODES, (item) => item.books);

/** The heat scale's steps (wireframes: `· none ░ 1–2 ▒ 3–5 ▓ 6–9 █ 10+`). */
export const HEAT_STEPS = [
  { from: 0, label: 'none' },
  { from: 1, label: '1–2' },
  { from: 3, label: '3–5' },
  { from: 6, label: '6–9' },
  { from: 10, label: '10+' },
] as const;

/** A count's step on the heat scale, 0 (none) to 4 (10 or more). */
export function heatStep(count: number): number {
  return HEAT_STEPS.findLastIndex((step) => count >= step.from);
}

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

/** The theme map's data: every live tag, and everything with one in a live lesson. */
export interface ThemeData {
  tags: Tag[];
  items: TaggedItem[];
}

export async function themeData(db: LampDb = appDb): Promise<ThemeData> {
  const [tags, sectionTags, lessonTags] = await Promise.all([
    db.tag.filter(live).toArray(),
    db.sectionTag.filter(live).toArray(),
    db.lessonTag.filter(live).toArray(),
  ]);
  const sections = new Map(
    (await db.section.bulkGet([...new Set(sectionTags.map((l) => l.sectionId))]))
      .filter(live)
      .map((s) => [s.id, s]),
  );
  const lessonIds = new Set([
    ...lessonTags.map((l) => l.lessonId),
    ...[...sections.values()].map((s) => s.lessonId),
  ]);
  const lessons = new Map<string, Lesson>(
    (await db.lesson.bulkGet([...lessonIds])).filter(live).map((l) => [l.id, l]),
  );
  const sources = [...sections.keys(), ...lessons.keys()];
  const books = new Map<string, Set<BookCode>>();
  for (const citation of await db.citation.where('sourceId').anyOf(sources).toArray()) {
    // A lesson's own citations are its main passages; a section's, its chips.
    if (citation.sourceType !== 'section' && citation.sourceType !== 'lesson') continue;
    let cited = books.get(citation.sourceId);
    if (!cited) books.set(citation.sourceId, (cited = new Set()));
    cited.add(citation.book);
  }
  const booksOf = (id: string) => [...(books.get(id) ?? [])];

  const items: TaggedItem[] = [];
  for (const link of sectionTags) {
    const section = sections.get(link.sectionId);
    const lesson = section && lessons.get(section.lessonId);
    if (!section || !lesson) continue;
    items.push({
      tagId: link.tagId,
      kind: 'section',
      id: section.id,
      lessonId: lesson.id,
      date: lesson.date,
      books: booksOf(section.id),
    });
  }
  for (const link of lessonTags) {
    const lesson = lessons.get(link.lessonId);
    if (!lesson) continue;
    items.push({
      tagId: link.tagId,
      kind: 'lesson',
      id: lesson.id,
      lessonId: lesson.id,
      date: lesson.date,
      books: booksOf(lesson.id),
    });
  }
  return { tags, items };
}
