import type { Series } from '@lamp/domain';
import { action, type NewRow, type RowPatch } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

export function createSeries(fields: NewRow<'series'>, db: LampDb = appDb): Promise<Series> {
  return action(db, (w) => w.create('series', fields));
}

export function updateSeries(
  id: string,
  patch: RowPatch<'series'>,
  db: LampDb = appDb,
): Promise<Series> {
  return action(db, (w) => w.update('series', id, patch));
}

/** Deletes a series. Its lessons stay, without a series (UX-PATTERNS "Confirmations"). */
export function deleteSeries(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const lessons = await w.db.lesson.where('seriesId').equals(id).toArray();
    for (const lesson of lessons) {
      if (lesson.deletedAt === null) await w.update('lesson', lesson.id, { seriesId: null });
    }
    await w.remove('series', id);
  });
}
