import { type Lesson, MAX_LINK_LABEL, type NoteLinkAttrs, type Section } from '@lamp/domain';
import { db as appDb, type LampDb } from '@/data/db.ts';
import { firstWords, linkTitle } from '@/data/links.ts';
import { indexStatus, searchText } from '@/search/client.ts';
import { normaliseTerm, type TextHit } from '@/search/text-index.ts';

/** One row of the `[[` picker: a lesson, or a section with its lesson. */
export type LinkOption =
  { kind: 'lesson'; lesson: Lesson } | { kind: 'section'; section: Section; lesson: Lesson };

export interface LinkOptions {
  lessons: LinkOption[];
  sections: LinkOption[];
  /** The search index is still being built: lesson titles only, for now. */
  searching: boolean;
}

/** How many of each kind the picker lists. */
const SHOWN = 5;

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

const newestFirst = (a: Lesson, b: Lesson) =>
  b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);

interface Search {
  ready: () => boolean;
  text: (query: string) => Promise<TextHit[]>;
}

const SEARCH: Search = { ready: () => indexStatus() === 'ready', text: searchText };

/**
 * What the `[[` picker offers for what's typed after it (F23, wireframes/thinking.md "Link
 * picker"): with nothing typed, the five most recent lessons; otherwise lessons by title and
 * sections by their text, from the search index (M4-05). While the index is being built, lesson
 * titles are matched here instead.
 */
export async function linkOptions(
  query: string,
  db: LampDb = appDb,
  search: Search = SEARCH,
): Promise<LinkOptions> {
  const text = query.trim();
  if (!text) {
    const recent = await db.lesson.filter((l) => l.deletedAt === null).toArray();
    const lessons = recent.toSorted(newestFirst).slice(0, SHOWN);
    return {
      lessons: lessons.map((lesson) => ({ kind: 'lesson', lesson })),
      sections: [],
      searching: false,
    };
  }
  if (!search.ready()) {
    const words = normaliseTerm(text).split(/\s+/);
    const found = await db.lesson
      .filter((l) => l.deletedAt === null && words.every((w) => normaliseTerm(l.title).includes(w)))
      .toArray();
    const lessons = found.toSorted(newestFirst).slice(0, SHOWN);
    return {
      lessons: lessons.map((lesson) => ({ kind: 'lesson', lesson })),
      sections: [],
      searching: true,
    };
  }

  const hits = await search.text(text);
  const lessonHits = hits.filter((h) => h.kind === 'lesson').slice(0, SHOWN);
  const sectionHits = hits.filter((h) => h.kind === 'section').slice(0, SHOWN);
  const sections = (await db.section.bulkGet(sectionHits.map((h) => h.id))).filter(live);
  const lessonIds = [
    ...new Set([...lessonHits.map((h) => h.id), ...sections.map((s) => s.lessonId)]),
  ];
  const lessons = new Map(
    (await db.lesson.bulkGet(lessonIds)).filter(live).map((lesson) => [lesson.id, lesson]),
  );
  return {
    lessons: lessonHits.flatMap((h): LinkOption[] => {
      const lesson = lessons.get(h.id);
      return lesson ? [{ kind: 'lesson', lesson }] : [];
    }),
    sections: sections.flatMap((section): LinkOption[] => {
      const lesson = lessons.get(section.lessonId);
      return lesson ? [{ kind: 'section', section, lesson }] : [];
    }),
    searching: false,
  };
}

/** The link chip an option makes, labelled with the target's title as it is now. */
export function linkOf(option: LinkOption): NoteLinkAttrs {
  const label =
    option.kind === 'lesson' ? linkTitle(option.lesson) : linkTitle(option.lesson, option.section);
  return {
    targetType: option.kind,
    targetId: option.kind === 'lesson' ? option.lesson.id : option.section.id,
    label: label.trim().slice(0, MAX_LINK_LABEL) || 'Untitled',
  };
}

/** A section option's own line in the picker: its first words. */
export const optionWords = (section: Pick<Section, 'body'>) => firstWords(section);
