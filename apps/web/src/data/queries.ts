import type { Lesson, Series } from '@lamp/domain';
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

/** How many sections a lesson has, for the delete confirmation. */
export function sectionCount(lessonId: string, db: LampDb = appDb): Promise<number> {
  return db.section.where('lessonId').equals(lessonId).filter(notDeleted).count();
}
