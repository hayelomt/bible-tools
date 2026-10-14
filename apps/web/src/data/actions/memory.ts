import {
  dueDate,
  type Grade,
  isDue,
  type MemoryItem,
  newSrsState,
  type Passage,
  passageRange,
  review,
  type VerseRef,
} from '@lamp/domain';
import { action, RowNotFoundError } from '../action.ts';
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

/** Every live memory item, soonest due first, then in the order they were added. */
export async function memoryItems(db: LampDb = appDb): Promise<MemoryItem[]> {
  const items = await db.memoryItem.filter((item) => item.deletedAt === null).toArray();
  return items.toSorted(
    (a, b) =>
      dueDate(a).localeCompare(dueDate(b)) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  );
}

/** The memory items due on or before `today`, in the order they're reviewed. */
export async function dueMemoryItems(today: string, db: LampDb = appDb): Promise<MemoryItem[]> {
  return (await memoryItems(db)).filter((item) => isDue(item, today));
}

/**
 * A review on the card (M6-02): the grade sets the next review by SM-2 (`domain/srs.ts`). Read
 * inside the write, so two quick grades build on each other.
 */
export function gradeMemoryItem(
  id: string,
  grade: Grade,
  today: string,
  db: LampDb = appDb,
): Promise<MemoryItem> {
  return action(db, async (w) => {
    const item = await w.db.memoryItem.get(id);
    if (!item || item.deletedAt !== null) throw new RowNotFoundError('memoryItem', id);
    return w.update('memoryItem', id, review(item, grade, today));
  });
}

/** Deletes at once; the toast offers Undo (UX-PATTERNS "Confirmations"). */
export function removeMemoryItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('memoryItem', id));
}

export function restoreMemoryItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('memoryItem', id));
}
