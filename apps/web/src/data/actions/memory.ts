import {
  type MemoryItem,
  newSrsState,
  type Passage,
  passageRange,
  type VerseRef,
} from '@lamp/domain';
import { action } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/** The live memory item for exactly `passage`, if there is one. */
export async function memoryItemFor(
  passage: Passage,
  db: LampDb = appDb,
): Promise<MemoryItem | undefined> {
  const [start, end] = passageRange(passage);
  const citations = await db.citation
    .where('startOrd')
    .equals(start)
    .filter((row) => row.endOrd === end && row.sourceType === 'memory_item')
    .toArray();
  const items = await db.memoryItem.bulkGet(citations.map((row) => row.sourceId));
  return items.find((item) => item?.deletedAt === null);
}

/**
 * "Memorise" (F10, wireframes/review.md): adds the passage to the memory verses, due `today` (the
 * caller's), with the text it was read in. A passage already there gets that item back, unchanged.
 */
export function memorise(
  ref: VerseRef,
  today: string,
  db: LampDb = appDb,
): Promise<{ item: MemoryItem; added: boolean }> {
  return action(db, async (w) => {
    const existing = await memoryItemFor(ref, w.db);
    if (existing) return { item: existing, added: false };
    const item = await w.create('memoryItem', { ref, ...newSrsState(today) });
    return { item, added: true };
  });
}

/** Deletes at once; the toast offers Undo (UX-PATTERNS "Confirmations"). */
export function removeMemoryItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('memoryItem', id));
}

export function restoreMemoryItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('memoryItem', id));
}
