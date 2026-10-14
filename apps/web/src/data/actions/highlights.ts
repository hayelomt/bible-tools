import type { Highlight } from '@lamp/domain';
import { action, type NewRow, type RowPatch } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/** Stores a highlight (F8). Its citation is rebuilt with the row, and the change is queued. */
export function createHighlight(
  fields: NewRow<'highlight'>,
  db: LampDb = appDb,
): Promise<Highlight> {
  return action(db, (w) => w.create('highlight', fields));
}

export function updateHighlight(
  id: string,
  patch: RowPatch<'highlight'>,
  db: LampDb = appDb,
): Promise<Highlight> {
  return action(db, (w) => w.update('highlight', id, patch));
}

/** Deletes at once; the reader offers Undo (UX-PATTERNS "Confirmations"). */
export function removeHighlight(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('highlight', id));
}

export function restoreHighlight(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('highlight', id));
}
