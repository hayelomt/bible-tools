import {
  changeSchema,
  keyBetween,
  passageRange,
  SEED_TAGS,
  type SectionBody,
  type VerseRef,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { action, RowNotFoundError } from './action.ts';
import { updateSettings } from './actions/settings.ts';
import { LampDb, SETTINGS_KEY, SYNC_STATE_KEY } from './db.ts';
import { ensureDevice } from './setup.ts';

const ROM_8_28: VerseRef = {
  book: 'ROM',
  chapter: 8,
  verseStart: 28,
  display: 'Romans 8:28',
  translation: 'BSB',
};
const JHN_10_9: VerseRef = {
  book: 'JHN',
  chapter: 10,
  verseStart: 9,
  display: 'John 10:9',
  translation: 'BSB',
};
const withChip = (ref: VerseRef): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'verse', attrs: ref }] }],
});
const LESSON = {
  seriesId: null,
  title: 'The Good Shepherd',
  date: '2026-10-12',
  source: 'sermon' as const,
  speaker: null,
  church: null,
  mainPassages: [ROM_8_28],
};

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`test-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

/** Every row in every table, to show an action left nothing behind. */
async function snapshot() {
  return Object.fromEntries(
    await Promise.all(db.tables.map(async (t) => [t.name, await t.toArray()] as const)),
  );
}

describe('first run', () => {
  it('gives the device an id, default settings and the seeded tags', async () => {
    const state = await db.syncState.get(SYNC_STATE_KEY);
    expect(state).toMatchObject({ cursor: 0, ownerUserId: null, clockOffsetMs: 0 });
    expect(await db.userSettings.get(SETTINGS_KEY)).toMatchObject({
      colorMode: 'system',
      reviewWindowDays: 14,
      autoPreviewVerses: true,
      pasteChips: true,
      openInTargets: ['blueletterbible', 'youversion', 'biblehub', 'logos'],
      rev: 0,
    });
    const tags = await db.tag.toArray();
    expect(tags.map((t) => t.name).toSorted()).toEqual([...SEED_TAGS].toSorted());
    expect(tags.every((t) => t.isSeeded)).toBe(true);
  });

  it('queues the seeded tags but not the default settings', async () => {
    const outbox = await db.outbox.toArray();
    expect(outbox).toHaveLength(SEED_TAGS.length);
    expect(outbox.every((c) => c.entity === 'tag' && c.op === 'upsert')).toBe(true);
  });

  it('runs once, however often it is called', async () => {
    const before = await snapshot();
    await Promise.all([
      ensureDevice(db, { colorMode: 'dark' }),
      ensureDevice(db, { colorMode: 'dark' }),
    ]);
    expect(await snapshot()).toEqual(before);
  });
});

describe('action', () => {
  it('writes the row, its citations and a valid change together', async () => {
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    expect(await db.lesson.get(lesson.id)).toEqual(lesson);
    expect(lesson).toMatchObject({ rev: 0, deletedAt: null });

    const citations = await db.citation.where('sourceId').equals(lesson.id).toArray();
    expect(citations).toEqual([
      expect.objectContaining({
        sourceType: 'lesson',
        lessonId: lesson.id,
        startOrd: passageRange(ROM_8_28)[0],
      }),
    ]);

    const change = await db.outbox.orderBy('seq').last();
    expect(change).toMatchObject({
      entity: 'lesson',
      entityId: lesson.id,
      op: 'upsert',
      baseRev: 0,
    });
    const { seq: _, ...sent } = change!;
    expect(changeSchema.parse(sent)).toEqual(sent);
    expect(sent).not.toHaveProperty('row.rev');
  });

  it('replaces the citations when a row changes', async () => {
    const section = await action(db, async (w) => {
      const lesson = await w.create('lesson', LESSON);
      return w.create('section', {
        lessonId: lesson.id,
        parentId: null,
        orderKey: keyBetween(),
        body: withChip(ROM_8_28),
        conflictOf: null,
        conflictDevice: null,
      });
    });
    await action(db, (w) => w.update('section', section.id, { body: withChip(JHN_10_9) }));
    const citations = await db.citation.where('sourceId').equals(section.id).toArray();
    expect(citations.map((c) => c.book)).toEqual(['JHN']);
  });

  it('deletes with a tombstone, drops the citations and queues a delete', async () => {
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    await action(db, (w) => w.remove('lesson', lesson.id));
    expect((await db.lesson.get(lesson.id))?.deletedAt).not.toBeNull();
    expect(await db.citation.where('sourceId').equals(lesson.id).count()).toBe(0);
    const change = await db.outbox.orderBy('seq').last();
    expect(change).toMatchObject({ entity: 'lesson', entityId: lesson.id, op: 'delete' });
    expect(change).not.toHaveProperty('row');

    const queued = await db.outbox.count();
    await action(db, (w) => w.remove('lesson', lesson.id));
    expect(await db.outbox.count()).toBe(queued);
  });

  it('restores a deleted row with its citations, and queues it as an upsert', async () => {
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    await action(db, (w) => w.remove('lesson', lesson.id));
    await action(db, (w) => w.restore('lesson', lesson.id));
    expect((await db.lesson.get(lesson.id))?.deletedAt).toBeNull();
    expect(await db.citation.where('sourceId').equals(lesson.id).count()).toBe(1);
    const change = await db.outbox.orderBy('seq').last();
    expect(change).toMatchObject({ entityId: lesson.id, op: 'upsert', row: { deletedAt: null } });

    const queued = await db.outbox.count();
    await action(db, (w) => w.restore('lesson', lesson.id));
    expect(await db.outbox.count()).toBe(queued);
  });

  it('stamps every write with the device time adjusted by the clock offset', async () => {
    await db.syncState.update(SYNC_STATE_KEY, { clockOffsetMs: 60 * 60 * 1000 });
    const before = Date.now();
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    const offset = Date.parse(lesson.updatedAt) - before;
    expect(offset).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(offset).toBeLessThan(60 * 60 * 1000 + 5000);
  });

  it('keeps the base rev of a synced row, so the server can spot a conflict', async () => {
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    await db.lesson.update(lesson.id, { rev: 7 }); // as if a pull had applied rev 7
    await action(db, (w) => w.update('lesson', lesson.id, { title: 'Renamed' }));
    expect(await db.outbox.orderBy('seq').last()).toMatchObject({ baseRev: 7 });
  });

  it('names the fields each change edited, so a conflict takes only those', async () => {
    const lesson = await action(db, (w) => w.create('lesson', LESSON));
    expect(await db.outbox.orderBy('seq').last()).not.toHaveProperty('changed');

    await action(db, (w) => w.update('lesson', lesson.id, { title: 'Renamed' }));
    const update = await db.outbox.orderBy('seq').last();
    expect(update).toMatchObject({ changed: ['title', 'updatedAt'] });
    const { seq: _, ...sent } = update!;
    expect(changeSchema.parse(sent)).toEqual(sent);

    await action(db, (w) => w.remove('lesson', lesson.id));
    await action(db, (w) => w.restore('lesson', lesson.id));
    expect(await db.outbox.orderBy('seq').last()).toMatchObject({
      changed: ['deletedAt', 'updatedAt'],
    });

    await action(db, (w) => w.updateSettings({ colorMode: 'dark' }));
    expect(await db.outbox.orderBy('seq').last()).toMatchObject({
      entity: 'userSettings',
      changed: ['colorMode', 'updatedAt'],
    });
  });

  describe('when something fails, nothing is saved or queued', () => {
    it('an error thrown after some writes', async () => {
      const before = await snapshot();
      const failing = action(db, async (w) => {
        const lesson = await w.create('lesson', LESSON);
        await w.create('section', {
          lessonId: lesson.id,
          parentId: null,
          orderKey: keyBetween(),
          body: withChip(JHN_10_9),
          conflictOf: null,
          conflictDevice: null,
        });
        await w.updateSettings({ colorMode: 'light' });
        throw new Error('the tab died');
      });
      await expect(failing).rejects.toThrow('the tab died');
      expect(await snapshot()).toEqual(before);
    });

    it('a row that fails its schema', async () => {
      const lesson = await action(db, (w) => w.create('lesson', LESSON));
      const before = await snapshot();
      const failing = action(db, async (w) => {
        await w.update('lesson', lesson.id, { mainPassages: [JHN_10_9] });
        await w.create('takeaway', { lessonId: lesson.id, text: '   ' });
      });
      await expect(failing).rejects.toThrow('Too small');
      expect(await snapshot()).toEqual(before);
    });

    it('an update to a row that does not exist', async () => {
      const before = await snapshot();
      const failing = action(db, async (w) => {
        await w.create('lesson', LESSON);
        await w.update('lesson', '0199c3a0-0000-7000-8000-000000000000', { title: 'x' });
      });
      await expect(failing).rejects.toBeInstanceOf(RowNotFoundError);
      expect(await snapshot()).toEqual(before);
    });
  });
});

describe('updateSettings', () => {
  it('stores the settings and queues them', async () => {
    const settings = await updateSettings({ colorMode: 'dark', reviewWindowDays: 7 }, db);
    expect(await db.userSettings.get(SETTINGS_KEY)).toEqual(settings);
    const change = await db.outbox.orderBy('seq').last();
    const { seq: _, ...sent } = change!;
    expect(changeSchema.parse(sent)).toMatchObject({
      entity: 'userSettings',
      row: { colorMode: 'dark', reviewWindowDays: 7 },
    });
  });

  it('rejects a value outside the schema', async () => {
    const before = await snapshot();
    // @ts-expect-error: not a mode
    await expect(updateSettings({ colorMode: 'dim' }, db)).rejects.toThrow('colorMode');
    expect(await snapshot()).toEqual(before);
  });
});
