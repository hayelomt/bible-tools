import {
  citedRefs,
  formatPassage,
  type Highlight,
  type Lesson,
  type MemoryItem,
  type ParsedPassage,
  type Passage,
  parseReference,
  passageRange,
  passagesOverlap,
  type Section,
  type Tag,
  tagKey,
  normaliseTagName,
  toPlainText,
  verseCount,
} from '@lamp/domain';
import { db as appDb, type LampDb } from '@/data/db.ts';
import { byDate, lessonSections, readingOrder, taggedWith } from '@/data/queries.ts';
import type { TextHit } from './text-index.ts';

/**
 * The three kinds of query one box takes (wireframes/search.md): a leading `#` is a tag, a
 * reference the parser reads is a verse query, anything else is free text.
 */
export type ParsedQuery =
  | { kind: 'empty' }
  | { kind: 'tag'; name: string }
  | { kind: 'verse'; passage: ParsedPassage }
  | { kind: 'text'; text: string };

export function parseQuery(input: string): ParsedQuery {
  const text = input.trim();
  if (!text) return { kind: 'empty' };
  if (text.startsWith('#')) return { kind: 'tag', name: normaliseTagName(text) };
  const reference = parseReference(text);
  if (reference.ok) return { kind: 'verse', passage: reference.ref };
  return { kind: 'text', text };
}

/**
 * One result row. A `lesson` row is the lesson itself: its title matched, a main passage cites
 * the verse, or it has the tag.
 */
export type ResultItem =
  | { kind: 'lesson'; id: string; text: string; terms?: string[]; passages?: string[] }
  | {
      kind: 'section';
      id: string;
      text: string;
      reply: boolean;
      terms?: string[];
      passages?: string[];
    }
  | { kind: 'takeaway' | 'question'; id: string; text: string; terms?: string[] };

/** Results are grouped by lesson, newest lesson first (F6). */
export interface ResultGroup {
  lesson: Lesson;
  items: ResultItem[];
}

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

async function liveLessons(ids: Iterable<string>, db: LampDb): Promise<Lesson[]> {
  const lessons = await db.lesson.bulkGet([...new Set(ids)]);
  return lessons.filter(live).toSorted(byDate).toReversed();
}

/** A lesson's sections among `sections`, in reading order. */
async function inReadingOrder(lessonId: string, sections: Section[], db: LampDb) {
  const own = sections.filter((s) => s.lessonId === lessonId);
  const all = own.some((s) => s.parentId) ? await lessonSections(lessonId, db) : own;
  return readingOrder(own, all);
}

const KIND_ORDER = { lesson: 0, section: 1, takeaway: 2, question: 3 } as const;

/**
 * Free text matches grouped by lesson. In a lesson: its title, then sections in reading order,
 * then takeaways and questions in the order they were added (their UUIDv7 ids sort that way).
 */
export async function textResults(hits: TextHit[], db: LampDb = appDb): Promise<ResultGroup[]> {
  const sections = new Map(
    (await db.section.bulkGet(hits.filter((h) => h.kind === 'section').map((h) => h.id)))
      .filter(live)
      .map((s) => [s.id, s]),
  );
  const lessons = await liveLessons(
    hits.map((h) => h.lessonId),
    db,
  );
  return Promise.all(
    lessons.map(async (lesson) => {
      const own = hits.filter((h) => h.lessonId === lesson.id);
      const ordered = await inReadingOrder(lesson.id, [...sections.values()], db);
      const position = new Map(ordered.map((s, i) => [s.id, i]));
      const items = own
        .filter((h) => h.kind !== 'section' || sections.has(h.id))
        .toSorted(
          (a, b) =>
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0) ||
            a.id.localeCompare(b.id),
        )
        .map((hit): ResultItem => {
          const base = { id: hit.id, text: hit.text, terms: hit.terms };
          if (hit.kind === 'section') {
            return { ...base, kind: 'section', reply: !!sections.get(hit.id)?.parentId };
          }
          return { ...base, kind: hit.kind };
        });
      return { lesson, items };
    }),
  ).then((groups) => groups.filter((g) => g.items.length > 0));
}

/**
 * Everything citing a passage that overlaps `passage` (F6: "Rom 8" matches any chip within the
 * chapter): sections by their verse chips, lessons by their main passages.
 */
export async function verseResults(passage: Passage, db: LampDb = appDb): Promise<ResultGroup[]> {
  const [start, end] = passageRange(passage);
  const citations = await db.citation
    .where('startOrd')
    .belowOrEqual(end)
    .filter((c) => c.endOrd >= start)
    .toArray();
  const ids = (type: string) => [
    ...new Set(citations.filter((c) => c.sourceType === type).map((c) => c.sourceId)),
  ];
  const sections = (await db.section.bulkGet(ids('section'))).filter(live);
  const citingLessons = new Set(ids('lesson'));
  const lessons = await liveLessons([...citingLessons, ...sections.map((s) => s.lessonId)], db);

  return Promise.all(
    lessons.map(async (lesson) => {
      const items: ResultItem[] = [];
      if (citingLessons.has(lesson.id)) {
        const passages = lesson.mainPassages.filter((p) => passagesOverlap(p, passage));
        items.push({
          kind: 'lesson',
          id: lesson.id,
          text: lesson.title,
          passages: passages.map((p) => formatPassage(p)),
        });
      }
      for (const section of await inReadingOrder(lesson.id, sections, db)) {
        items.push({
          kind: 'section',
          id: section.id,
          text: toPlainText(section.body),
          reply: !!section.parentId,
          passages: citedRefs(section.body)
            .filter((ref) => passagesOverlap(ref, passage))
            .map((ref) => ref.display),
        });
      }
      return { lesson, items };
    }),
  );
}

/** A row of the verse index: a note, a lesson's main passage, a highlight or a memory verse. */
export type VerseIndexEntry =
  | (Extract<ResultItem, { kind: 'lesson' | 'section' }> & { lesson: Lesson })
  | {
      kind: 'highlight';
      id: string;
      colour: Highlight['colour'];
      note: string | null;
      /** The highlight's own reference, as stored. */
      passages: string[];
      /** The verse text frozen when it was highlighted. */
      text: string;
      createdAt: string;
      ref: Highlight['ref'];
    }
  | { kind: 'memory'; id: string; item: MemoryItem; createdAt: string };

/**
 * The verse index (F7, wireframes/verses.md): everything citing a passage that overlaps
 * `passage`, newest first. Notes stay in their lesson's order; a highlight or memory verse takes
 * the time it was added, so one added on a later day sits above an older lesson.
 */
export async function verseIndex(passage: Passage, db: LampDb = appDb): Promise<VerseIndexEntry[]> {
  const [groups, highlights, memory] = await Promise.all([
    verseResults(passage, db),
    highlightEntries(passage, db),
    memoryEntries(passage, db),
  ]);
  const notes = groups.flatMap(({ lesson, items }) =>
    items.flatMap((item) =>
      item.kind === 'lesson' || item.kind === 'section' ? [{ ...item, lesson }] : [],
    ),
  );
  return [...notes, ...highlights, ...memory]
    .map((entry, index) => ({ entry, index }))
    .toSorted((a, b) => when(b.entry).localeCompare(when(a.entry)) || a.index - b.index)
    .map(({ entry }) => entry);
}

/** The ids of rows of `sourceType` whose passage overlaps `passage`, from the citation index. */
async function citing(passage: Passage, sourceType: string, db: LampDb): Promise<string[]> {
  const [start, end] = passageRange(passage);
  const citations = await db.citation
    .where('startOrd')
    .belowOrEqual(end)
    .filter((row) => row.endOrd >= start && row.sourceType === sourceType)
    .toArray();
  return citations.map((row) => row.sourceId);
}

async function highlightEntries(passage: Passage, db: LampDb): Promise<VerseIndexEntry[]> {
  const rows = (await db.highlight.bulkGet(await citing(passage, 'highlight', db))).filter(live);
  return rows.map((row) => ({
    kind: 'highlight',
    id: row.id,
    colour: row.colour,
    note: row.note,
    passages: [row.ref.display],
    text: row.ref.snapshotText ?? '',
    createdAt: row.createdAt,
    ref: row.ref,
  }));
}

async function memoryEntries(passage: Passage, db: LampDb): Promise<VerseIndexEntry[]> {
  const rows = (await db.memoryItem.bulkGet(await citing(passage, 'memory_item', db))).filter(live);
  return rows.map((item) => ({ kind: 'memory', id: item.id, item, createdAt: item.createdAt }));
}

/**
 * A lesson is dated at the start of its day; a highlight or memory verse at the moment it was
 * stored.
 */
function when(entry: VerseIndexEntry): string {
  return entry.kind === 'lesson' || entry.kind === 'section'
    ? `${entry.lesson.date}T00:00:00.000Z`
    : entry.createdAt;
}

/**
 * The verses of a chapter that notes cite (F8 reader markers, M5-04): every verse a live section's
 * chip covers, so a marker shows exactly where the verse index lists a note. Lessons' main
 * passages and highlights don't mark verses (decided 2026-10-14).
 */
export async function notedVerses(
  book: Passage['book'],
  chapter: number,
  db: LampDb = appDb,
): Promise<Set<number>> {
  const [start, end] = passageRange({ book, chapter });
  const citations = await db.citation
    .where('startOrd')
    .belowOrEqual(end)
    .filter((row) => row.endOrd >= start && row.sourceType === 'section')
    .toArray();
  const sections = (
    await db.section.bulkGet([...new Set(citations.map((c) => c.sourceId))])
  ).filter(live);
  const lessons = new Set(
    (
      await liveLessons(
        sections.map((s) => s.lessonId),
        db,
      )
    ).map((l) => l.id),
  );
  const noted = new Set(sections.filter((s) => lessons.has(s.lessonId)).map((s) => s.id));
  const verses = new Set<number>();
  const last = verseCount(book, chapter);
  for (const citation of citations) {
    if (!noted.has(citation.sourceId)) continue;
    const from = Math.max(citation.startOrd, start) - start;
    const to = Math.min(citation.endOrd, end) - start;
    for (let verse = Math.max(from, 1); verse <= Math.min(to, last); verse++) verses.add(verse);
  }
  return verses;
}

/** A tag with how many sections and lessons carry it, for the suggestions. */
export interface TagCount {
  tag: Tag;
  uses: number;
}

/**
 * Tags whose name starts with what's typed after `#`, most used first (wireframes/search.md
 * "Tag query"). An empty name lists every tag.
 */
export async function tagSuggestions(name: string, db: LampDb = appDb): Promise<TagCount[]> {
  const key = tagKey(name);
  const [tags, sectionLinks, lessonLinks] = await Promise.all([
    db.tag.filter((t) => t.deletedAt === null && tagKey(t.name).startsWith(key)).toArray(),
    db.sectionTag.filter((l) => l.deletedAt === null).toArray(),
    db.lessonTag.filter((l) => l.deletedAt === null).toArray(),
  ]);
  const uses = new Map<string, number>();
  for (const { tagId } of [...sectionLinks, ...lessonLinks]) {
    uses.set(tagId, (uses.get(tagId) ?? 0) + 1);
  }
  return tags
    .map((tag) => ({ tag, uses: uses.get(tag.id) ?? 0 }))
    .toSorted(
      (a, b) =>
        b.uses - a.uses || a.tag.name.localeCompare(b.tag.name, undefined, { sensitivity: 'base' }),
    );
}

/** The tag named exactly `name`, ignoring case, if there is one. */
export async function tagNamed(name: string, db: LampDb = appDb): Promise<Tag | null> {
  const key = tagKey(name);
  if (!key) return null;
  const tag = await db.tag.filter((t) => t.deletedAt === null && tagKey(t.name) === key).first();
  return tag ?? null;
}

/** A tag's results, as on its tag page: the lesson itself when it's tagged, then its sections. */
export async function tagResults(tagId: string, db: LampDb = appDb): Promise<ResultGroup[]> {
  const groups = await taggedWith(tagId, db);
  return groups.map(({ lesson, lessonTagged, sections }) => ({
    lesson,
    items: [
      ...(lessonTagged ? [{ kind: 'lesson' as const, id: lesson.id, text: lesson.title }] : []),
      ...sections.map((s) => ({
        kind: 'section' as const,
        id: s.id,
        text: toPlainText(s.body),
        reply: !!s.parentId,
      })),
    ],
  }));
}
