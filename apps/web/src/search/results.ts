import {
  citedRefs,
  formatPassage,
  type Lesson,
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

/** A row of the verse index: a section or a lesson's main passage, with its lesson. */
export type VerseIndexEntry = Extract<ResultItem, { kind: 'lesson' | 'section' }> & {
  lesson: Lesson;
};

/**
 * The verse index (F7, wireframes/verses.md): everything citing a passage that overlaps
 * `passage`, newest lesson first; in a lesson, its main passage, then sections in reading order.
 */
export async function verseIndex(passage: Passage, db: LampDb = appDb): Promise<VerseIndexEntry[]> {
  const groups = await verseResults(passage, db);
  return groups.flatMap(({ lesson, items }) =>
    items.flatMap((item) =>
      item.kind === 'lesson' || item.kind === 'section' ? [{ ...item, lesson }] : [],
    ),
  );
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
