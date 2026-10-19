import { SEED_TAGS } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb, SETTINGS_KEY } from '@/data/db.ts';
import { questionViews } from '@/data/question-status.ts';
import { ensureDevice } from '@/data/setup.ts';
import { verseIndex } from '@/search/results.ts';
import { clearDevice, seedBulk, seedDemo } from './seed.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`seed-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'dark' });
});

afterEach(async () => {
  await db.delete();
});

describe('seedDemo', () => {
  it('writes the demo month through the actions', async () => {
    await seedDemo(db);
    expect(await db.series.count()).toBe(2);
    expect(await db.lesson.count()).toBe(12);
    expect(await db.section.filter((s) => s.parentId !== null).count()).toBeGreaterThan(3);
    const questions = await questionViews(await db.question.toArray(), db);
    expect(questions.map((q) => q.status).toSorted()).toEqual([
      'answered',
      'answered',
      'open',
      'open',
      'open',
      'open',
      'open',
      'open',
      'parked',
      'parked',
    ]);
    // Custom tags join the seeded ones.
    const names = (await db.tag.toArray()).map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(['assurance', 'adoption', 'rest']));
    // Every write was queued, as in use.
    expect(await db.outbox.count()).toBeGreaterThan(100);
    // Romans 8 reaches the range that starts in chapter 7, and two lessons' main passages.
    const rom8 = await verseIndex({ book: 'ROM', chapter: 8 }, db);
    expect(rom8.flatMap((entry) => ('lesson' in entry ? [entry.lesson.title] : []))).toContain(
      'The wretched man',
    );
    expect(rom8.filter((e) => e.kind === 'lesson')).toHaveLength(2);
  });
});

describe('seedBulk', () => {
  it('writes lessons of generated sections in a series', async () => {
    await seedBulk(db, 2, 10);
    expect(await db.lesson.count()).toBe(2);
    expect(await db.section.count()).toBe(20);
    expect(await db.citation.count()).toBe(2);
  });
});

describe('clearDevice', () => {
  it('empties the notes and sets the device up again, keeping its settings', async () => {
    await seedDemo(db);
    await clearDevice(db);
    expect(await db.lesson.count()).toBe(0);
    expect(await db.citation.count()).toBe(0);
    expect(await db.tag.count()).toBe(SEED_TAGS.length);
    expect(await db.userSettings.get(SETTINGS_KEY)).toMatchObject({
      colorMode: 'dark',
    });
  });
});
