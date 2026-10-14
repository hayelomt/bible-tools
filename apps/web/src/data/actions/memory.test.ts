import { memoryItemSchema } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verseIndex } from '@/search/results.ts';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import { memoryItemFor, memorise, removeMemoryItem, restoreMemoryItem } from './memory.ts';

let db: LampDb;
let dbCount = 0;

const ref = {
  book: 'JHN' as const,
  chapter: 10,
  verseStart: 27,
  display: 'John 10:27',
  translation: 'WEB' as const,
  snapshotText: 'My sheep hear my voice, and I know them, and they follow me.',
};

beforeEach(async () => {
  db = new LampDb(`memory-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

describe('memorise', () => {
  it('adds a verse due today, with a citation and an outbox change', async () => {
    const { item, added } = await memorise(ref, '2026-10-14', db);
    expect(added).toBe(true);
    expect(item).toMatchObject({
      ref,
      ease: 2.5,
      interval: 0,
      nextReviewAt: '2026-10-14T00:00:00.000Z',
      reviewCount: 0,
    });

    const citations = await db.citation.toArray();
    expect(citations).toEqual([
      expect.objectContaining({ sourceType: 'memory_item', sourceId: item.id, lessonId: null }),
    ]);
    const [change] = await db.outbox.toArray();
    expect(change).toMatchObject({ entity: 'memoryItem', op: 'upsert' });
    const row = change?.op === 'upsert' ? change.row : null;
    expect(memoryItemSchema.omit({ rev: true }).safeParse(row).success).toBe(true);
  });

  it('gives back the item already there for the same passage, and only that passage', async () => {
    const first = await memorise(ref, '2026-10-14', db);
    const again = await memorise(ref, '2026-10-15', db);
    expect(again).toEqual({ item: first.item, added: false });
    expect(await db.memoryItem.count()).toBe(1);

    // A range that starts on the same verse is another passage.
    const range = await memorise(
      { ...ref, verseEnd: 28, display: 'John 10:27–28' },
      '2026-10-14',
      db,
    );
    expect(range.added).toBe(true);
    expect((await memoryItemFor(ref, db))?.id).toBe(first.item.id);
    expect((await memoryItemFor({ book: 'JHN', chapter: 10, verseStart: 28 }, db))?.id).toBe(
      undefined,
    );
  });

  it('is removed and restored; a removed verse can be added again', async () => {
    const { item } = await memorise(ref, '2026-10-14', db);
    await removeMemoryItem(item.id, db);
    expect(await memoryItemFor(ref, db)).toBeUndefined();
    expect(await db.citation.count()).toBe(0);

    await restoreMemoryItem(item.id, db);
    expect((await memoryItemFor(ref, db))?.id).toBe(item.id);

    await removeMemoryItem(item.id, db);
    const added = await memorise(ref, '2026-10-16', db);
    expect(added.added).toBe(true);
    expect(added.item.id).not.toBe(item.id);
  });

  it('is listed in the verse index of any passage it overlaps, until removed', async () => {
    const { item } = await memorise(ref, '2026-10-14', db);
    const kinds = async (passage: Parameters<typeof verseIndex>[0]) =>
      (await verseIndex(passage, db)).map((entry) => [entry.kind, entry.id]);
    expect(await kinds({ book: 'JHN', chapter: 10 })).toEqual([['memory', item.id]]);
    expect(await kinds({ book: 'JHN', chapter: 10, verseStart: 26, verseEnd: 28 })).toEqual([
      ['memory', item.id],
    ]);
    expect(await kinds({ book: 'JHN', chapter: 10, verseStart: 28 })).toEqual([]);
    await removeMemoryItem(item.id, db);
    expect(await kinds({ book: 'JHN', chapter: 10 })).toEqual([]);
  });
});
