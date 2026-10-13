import type { Takeaway } from '@lamp/domain';
import { action, type NewRow } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * Stores a new takeaway (F5). The id comes from the list, which showed it as a draft until it had
 * text. `createdAt` is the action's time, which the review queue reads (§8.8).
 */
export function createTakeaway(fields: NewRow<'takeaway'>, db: LampDb = appDb): Promise<Takeaway> {
  return action(db, (w) => w.create('takeaway', fields));
}

export function updateTakeaway(id: string, text: string, db: LampDb = appDb): Promise<Takeaway> {
  return action(db, (w) => w.update('takeaway', id, { text }));
}

/** Deletes at once; the list offers Undo (UX-PATTERNS "Confirmations"). */
export function removeTakeaway(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('takeaway', id));
}

export function restoreTakeaway(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('takeaway', id));
}
