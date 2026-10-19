import { memoryItemSchema } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verseIndex } from '@/search/results.ts';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import { RowNotFoundError } from '../action.ts';
import {
  dueMemoryItems,
  gradeMemoryItem,
  memoryItemFor,
  memorise,
  removeMemoryItem,
  restoreMemoryItem,
} from './memory.ts';

let db: LampDb;
let dbCount = 0;

const ref = {
  book: 'JHN' as const,
  chapter: 10,
  verseStart: 27,
  display: 'John 10:27',
};

beforeEach(async () => {
  db = new LampDb(`memory-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
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

describe('gradeMemoryItem', () => {
  it('moves nextReviewAt by the grade and syncs only the schedule', async () => {
    const { item } = await memorise(ref, '2026-10-14', db);
    await db.outbox.clear();

    const good = await gradeMemoryItem(item.id, 'good', '2026-10-14', db);
    expect(good).toMatchObject({
      ease: 2.5,
      interval: 1,
      nextReviewAt: '2026-10-15T00:00:00.000Z',
      reviewCount: 1,
    });
    const [change] = await db.outbox.toArray();
    expect(change).toMatchObject({ entity: 'memoryItem', entityId: item.id, op: 'upsert' });
    expect(change?.op === 'upsert' ? change.changed?.toSorted() : null).toEqual(
      ['ease', 'interval', 'nextReviewAt', 'reviewCount', 'updatedAt'].toSorted(),
    );

    const again = await gradeMemoryItem(item.id, 'again', '2026-10-15', db);
    expect(again).toMatchObject({ interval: 0, nextReviewAt: '2026-10-15T00:00:00.000Z' });
    expect(await db.memoryItem.get(item.id)).toEqual(again);
  });

  it('refuses a removed verse', async () => {
    const { item } = await memorise(ref, '2026-10-14', db);
    await removeMemoryItem(item.id, db);
    await expect(gradeMemoryItem(item.id, 'good', '2026-10-14', db)).rejects.toThrow(
      RowNotFoundError,
    );
  });
});

describe('dueMemoryItems', () => {
  it('lists the verses due by today, longest due first, then in the order added', async () => {
    const romans = {
      ...ref,
      book: 'ROM' as const,
      chapter: 8,
      verseStart: 28,
      display: 'Romans 8:28',
    };
    const psalm = {
      ...ref,
      book: 'PSA' as const,
      chapter: 23,
      verseStart: 1,
      display: 'Psalm 23:1',
    };
    const john = (await memorise(ref, '2026-10-14', db)).item;
    const rom = (await memorise(romans, '2026-10-12', db)).item;
    const psa = (await memorise(psalm, '2026-10-14', db)).item;
    await gradeMemoryItem(psa.id, 'good', '2026-10-14', db);

    const due = async (day: string) => (await dueMemoryItems(day, db)).map((i) => i.ref.display);
    expect(await due('2026-10-14')).toEqual(['Romans 8:28', 'John 10:27']);
    expect(await due('2026-10-15')).toEqual(['Romans 8:28', 'John 10:27', 'Psalm 23:1']);
    expect(await due('2026-10-11')).toEqual([]);
    await removeMemoryItem(rom.id, db);
    expect(await due('2026-10-14')).toEqual([john.ref.display]);
  });
});
