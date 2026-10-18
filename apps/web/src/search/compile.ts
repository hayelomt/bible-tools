import {
  citedRefs,
  compile,
  type CompileGroup,
  formatPassage,
  getBook,
  isWholeBook,
  type Lesson,
  type Passage,
  passageRange,
  type Section,
  verseOrdinal,
} from '@lamp/domain';
import { db as appDb, type LampDb } from '@/data/db.ts';
import { byDate, readingOrder } from '@/data/queries.ts';

/** A section in the compile view, with its lesson for the byline. */
export interface CompiledNote {
  section: Section;
  lesson: Lesson;
  /** A reply shown under its section, which is just above it in the same group. */
  nested: boolean;
}

/** The compile view of a passage: its groups, and how many sections and lessons they hold. */
export interface Commentary {
  groups: CompileGroup<CompiledNote>[];
  sections: number;
  lessons: number;
  /** False for the first screen's groups alone, read before the rest (`firstGroups`). */
  complete: boolean;
}

/** A group's key: the range a citation covers (`compile` groups the chips the same way). */
const keyOf = (c: { startOrd: number; endOrd: number }) => `${c.startOrd}-${c.endOrd}`;

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

/**
 * Every live section citing a passage that overlaps `scope` (F22, M10-01), grouped by the passage
 * it cites (`compile`). Sections go in by lesson date, then in their lesson's reading order, so a
 * reply follows its section in a group they're both in.
 *
 * A section citing several passages in the scope is shown in full under the first, with a pointer
 * under the others (decided in M10-03).
 *
 * With `firstGroups`, only the sections of that many groups are read, for a first screen that
 * doesn't wait on a whole book (M10-02); the counts then come from the citations.
 */
export async function commentary(
  scope: Passage,
  db: LampDb = appDb,
  firstGroups?: number,
): Promise<Commentary> {
  const [start, end] = passageRange(scope);
  // A citation starts in the book it cites, so only the book's need reading.
  // Read as a range and filtered here: Dexie's `filter` walks a cursor, a row at a time.
  const citations = (
    await db.citation
      .where('startOrd')
      .between(verseOrdinal(scope.book, 0, 0), end, true, true)
      .toArray()
  ).filter((c) => c.endOrd >= start && c.sourceType === 'section');
  const first =
    firstGroups === undefined
      ? null
      : new Set(
          [...new Map(citations.map((c) => [keyOf(c), c])).values()]
            .toSorted((a, b) => a.startOrd - b.startOrd || a.endOrd - b.endOrd)
            .slice(0, firstGroups)
            .map(keyOf),
        );
  const wanted = first ? citations.filter((c) => first.has(keyOf(c))) : citations;
  const sections = (await db.section.bulkGet([...new Set(wanted.map((c) => c.sourceId))])).filter(
    live,
  );
  const lessons = new Map(
    (await db.lesson.bulkGet([...new Set(sections.map((s) => s.lessonId))]))
      .filter(live)
      .map((l) => [l.id, l]),
  );
  const own = sections.filter((s) => lessons.has(s.lessonId));
  // The parents of replies, for their place in the reading order.
  const ids = new Set(own.map((s) => s.id));
  const missing = [
    ...new Set(own.flatMap((s) => (s.parentId && !ids.has(s.parentId) ? [s.parentId] : []))),
  ];
  const parents = (await db.section.bulkGet(missing)).filter(live);

  const ordered = [...lessons.values()].toSorted(byDate).flatMap((lesson) => {
    const mine = own.filter((s) => s.lessonId === lesson.id);
    return readingOrder(mine, [...mine, ...parents]).map((section) => ({ section, lesson }));
  });
  const groups = compile(
    scope,
    ordered.map((note) => ({
      item: { ...note, nested: false },
      refs: citedRefs(note.section.body),
      date: note.lesson.date,
    })),
    'once',
  )
    .filter(
      (group) => !first || first.has(keyOf({ startOrd: group.range[0], endOrd: group.range[1] })),
    )
    .map((group) => {
      const seen = new Set<string>();
      return {
        ...group,
        entries: group.entries.map((entry) => {
          const { section } = entry.item;
          seen.add(section.id);
          const nested = !!section.parentId && seen.has(section.parentId);
          return nested ? { ...entry, item: { ...entry.item, nested } } : entry;
        }),
      };
    });
  if (first) {
    return {
      groups,
      sections: new Set(citations.map((c) => c.sourceId)).size,
      lessons: new Set(citations.map((c) => c.lessonId)).size,
      complete: false,
    };
  }
  return {
    groups,
    sections: own.length,
    lessons: new Set(own.map((s) => s.lessonId)).size,
    complete: true,
  };
}

/** A scope's name: "Romans 8:28", "Romans 8", or "Romans" for the whole book. */
export function scopeTitle(scope: Passage): string {
  return isWholeBook(scope) ? getBook(scope.book).name : formatPassage(scope);
}
