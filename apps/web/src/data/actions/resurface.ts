import {
  dismissedUntil,
  type Passage,
  type PassageVisit,
  passageRange,
  type ResurfaceDismissal,
  type ResurfaceRule,
} from '@lamp/domain';
import { today as todayOn } from '@/lib/dates.ts';
import { action } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * Records that a compile view was opened (F30, §17.8): one visit per scope per day on a device.
 * The same action deletes the scope's older visits, so about one live row per scope remains.
 * Returns the new visit, or null when the scope already has one from today.
 */
export function recordVisit(
  scope: Passage,
  today = todayOn(),
  db: LampDb = appDb,
): Promise<PassageVisit | null> {
  const [startOrd, endOrd] = passageRange(scope);
  return action(db, async (w) => {
    const same = await w.db.passageVisit
      .where('startOrd')
      .equals(startOrd)
      .filter((visit) => visit.deletedAt === null && visit.endOrd === endOrd)
      .toArray();
    if (same.some((visit) => todayOn(new Date(visit.createdAt)) === today)) return null;
    for (const visit of same) await w.remove('passageVisit', visit.id);
    return w.create('passageVisit', { book: scope.book, startOrd, endOrd });
  });
}

/** "Dismiss for a year" on a resurfaced item; it's hidden on every device until `until`. */
export function dismissResurfaced(
  rule: ResurfaceRule,
  targetKey: string,
  today = todayOn(),
  db: LampDb = appDb,
): Promise<ResurfaceDismissal> {
  return action(db, (w) =>
    w.create('resurfaceDismissal', { rule, targetKey, until: dismissedUntil(today) }),
  );
}

/** Undo of a dismissal: the item comes back. */
export function undoDismissal(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('resurfaceDismissal', id));
}
