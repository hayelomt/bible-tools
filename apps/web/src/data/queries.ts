import type { Lesson, Section, Series, Tag } from '@lamp/domain';
import type { TagLink, TagTarget } from './actions/tags.ts';
import { db as appDb, type LampDb } from './db.ts';

/**
 * Reads for the lesson and series screens, used through `useLiveQuery`. Tombstones are filtered
 * here, so screens never see a deleted row.
 */

const notDeleted = (row: { deletedAt: string | null }) => row.deletedAt === null;

/**
 * Lessons by date, oldest first; lessons on the same day in the order they were made (UUIDv7 ids
 * sort by creation time, so they also break a tie within one millisecond).
 */
const byDate = (a: Lesson, b: Lesson) =>
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

/** Every lesson, newest first. */
export async function allLessons(db: LampDb = appDb): Promise<Lesson[]> {
  const lessons = await db.lesson.filter(notDeleted).toArray();
  return lessons.toSorted(byDate).toReversed();
}

/** A series' lessons in date order, oldest first (wireframes/lessons.md "Series"). */
export async function seriesLessons(seriesId: string, db: LampDb = appDb): Promise<Lesson[]> {
  const lessons = await db.lesson.where('seriesId').equals(seriesId).filter(notDeleted).toArray();
  return lessons.toSorted(byDate);
}

export interface SeriesSummary extends Series {
  lessonCount: number;
}

/** Every series by title, with how many lessons it holds. */
export async function allSeries(db: LampDb = appDb): Promise<SeriesSummary[]> {
  const [series, lessons] = await Promise.all([
    db.series.filter(notDeleted).toArray(),
    db.lesson.filter(notDeleted).toArray(),
  ]);
  const counts = new Map<string, number>();
  for (const { seriesId } of lessons) {
    if (seriesId) counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1);
  }
  return series
    .map((s) => ({ ...s, lessonCount: counts.get(s.id) ?? 0 }))
    .toSorted((a, b) => a.title.localeCompare(b.title));
}

/**
 * One lesson or series by id: `null` when it doesn't exist or was deleted, so a screen can tell
 * "missing" from `useLiveQuery`'s `undefined` (not read yet).
 */
export async function lessonById(id: string, db: LampDb = appDb): Promise<Lesson | null> {
  const row = await db.lesson.get(id);
  return row && notDeleted(row) ? row : null;
}

export async function seriesById(id: string, db: LampDb = appDb): Promise<Series | null> {
  const row = await db.series.get(id);
  return row && notDeleted(row) ? row : null;
}

/** A lesson's sections, in no particular order (`outline` puts them in order). */
export function lessonSections(lessonId: string, db: LampDb = appDb): Promise<Section[]> {
  return db.section.where('lessonId').equals(lessonId).filter(notDeleted).toArray();
}

/** How many sections a lesson has, for the delete confirmation. */
export function sectionCount(lessonId: string, db: LampDb = appDb): Promise<number> {
  return db.section.where('lessonId').equals(lessonId).filter(notDeleted).count();
}

/** Every tag, seeded and custom, by name ignoring case. */
export async function allTags(db: LampDb = appDb): Promise<Tag[]> {
  const tags = await db.tag.filter(notDeleted).toArray();
  return tags.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** A tag on a section or lesson, with the link that puts it there. */
export interface AppliedTag {
  tag: Tag;
  link: TagLink;
}

/** The tags on a section or lesson, in the order they were added. */
export async function tagsOf(target: TagTarget, db: LampDb = appDb): Promise<AppliedTag[]> {
  const links =
    target.kind === 'section'
      ? await db.sectionTag.where('sectionId').equals(target.id).filter(notDeleted).toArray()
      : await db.lessonTag.where('lessonId').equals(target.id).filter(notDeleted).toArray();
  const entity = target.kind === 'section' ? 'sectionTag' : 'lessonTag';
  const tags = await db.tag.bulkGet(links.map((l) => l.tagId));
  return links
    .map((link, i) => ({ link, tag: tags[i] }))
    .filter((t): t is { link: (typeof links)[number]; tag: Tag } => !!t.tag && notDeleted(t.tag))
    .toSorted(
      (a, b) =>
        a.link.createdAt.localeCompare(b.link.createdAt) || a.link.id.localeCompare(b.link.id),
    )
    .map(({ link, tag }) => ({ tag, link: { entity, id: link.id } }));
}
