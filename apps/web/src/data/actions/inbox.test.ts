import type { SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import {
  addInboxItem,
  appendToSection,
  dismissInboxItem,
  inboxCount,
  inboxItemBody,
  inboxItemTitle,
  inboxItems,
  restoreInboxItem,
  sendToLesson,
  undoPlacement,
} from './inbox.ts';
import { createLesson } from './lessons.ts';
import { createSection, updateSection } from './sections.ts';

let db: LampDb;
let dbCount = 0;

const ref = {
  book: 'ROM' as const,
  chapter: 8,
  verseStart: 28,
  display: 'Romans 8:28',
  translation: 'BSB' as const,
  snapshotText: 'And we know that God works all things together for the good…',
};

const DAY = '2026-10-17';

beforeEach(async () => {
  db = new LampDb(`inbox-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const lesson = (title = 'The Good Shepherd') =>
  createLesson(
    {
      seriesId: null,
      title,
      date: '2026-10-12',
      source: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    },
    db,
  );

const paragraph = (text: string): SectionBody['content'][number] => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

describe('the inbox', () => {
  it('lists waiting items newest first, without placed, dismissed or snoozed ones', async () => {
    const older = await addInboxItem(
      { origin: 'typed', ref: null, text: 'older', receivedAt: '2026-10-15T09:00:00.000Z' },
      db,
    );
    const newer = await addInboxItem(
      { origin: 'share', ref, text: null, receivedAt: '2026-10-16T09:00:00.000Z' },
      db,
    );
    const snoozed = await addInboxItem(
      { origin: 'typed', ref: null, text: 'later', snoozedUntil: '2026-10-18' },
      db,
    );
    const gone = await addInboxItem({ origin: 'typed', ref: null, text: 'gone' }, db);
    await dismissInboxItem(gone.id, db);

    expect((await inboxItems(DAY, db)).map((item) => item.id)).toEqual([newer.id, older.id]);
    expect(await inboxCount(DAY, db)).toBe(2);
    // The snooze ends on its day.
    expect((await inboxItems('2026-10-18', db)).map((item) => item.id)).toContain(snoozed.id);
  });

  it('are never cited, so the verse index leaves them out until placed', async () => {
    await addInboxItem({ origin: 'share', ref, text: null }, db);
    expect(await db.citation.count()).toBe(0);
  });

  it('refuses an item with neither a verse nor text, and saves nothing', async () => {
    await expect(addInboxItem({ origin: 'typed', ref: null, text: '  ' }, db)).rejects.toThrow(
      'An inbox item needs a verse or some text',
    );
    expect(await db.inboxItem.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('queues each change for sync', async () => {
    const item = await addInboxItem({ origin: 'typed', ref: null, text: 'hesed' }, db);
    await dismissInboxItem(item.id, db);
    await restoreInboxItem(item.id, db);
    const queued = await db.outbox.toArray();
    expect(queued.map((change) => [change.entity, change.op])).toEqual([
      ['inboxItem', 'upsert'],
      ['inboxItem', 'delete'],
      ['inboxItem', 'upsert'],
    ]);
    expect(await inboxCount(DAY, db)).toBe(1);
  });
});

describe('sending an item to a lesson', () => {
  it('adds a section at the end with the chip and the text, and Undo takes it back out', async () => {
    const shepherd = await lesson();
    await createSection(
      {
        lessonId: shepherd.id,
        parentId: null,
        orderKey: 'a0',
        body: { type: 'doc', content: [paragraph('first')] },
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const item = await addInboxItem({ origin: 'share', ref, text: 'From Sunday' }, db);

    const placement = await sendToLesson(item.id, { lessonId: shepherd.id }, db);
    expect(placement.section).toMatchObject({ lessonId: shepherd.id, parentId: null });
    expect(placement.section.orderKey > 'a0').toBe(true);
    expect(placement.section.body).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'verse', attrs: ref }] },
        paragraph('From Sunday'),
      ],
    });
    expect(await db.inboxItem.get(item.id)).toMatchObject({
      placedInSectionId: placement.section.id,
    });
    expect(await inboxCount(DAY, db)).toBe(0);
    // The section is indexed as usual.
    expect(await db.citation.where('sourceId').equals(placement.section.id).count()).toBe(1);

    await undoPlacement(placement, db);
    expect(await db.section.get(placement.section.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
    expect(await db.inboxItem.get(item.id)).toMatchObject({ placedInSectionId: null });
    expect(await inboxCount(DAY, db)).toBe(1);
  });

  it('makes a new personal lesson titled from the item, which Undo removes too', async () => {
    const item = await addInboxItem({ origin: 'share', ref, text: null }, db);
    const placement = await sendToLesson(item.id, { newLesson: { date: DAY } }, db);
    const { snapshotText: _text, ...passage } = ref;
    expect(placement.lesson).toMatchObject({
      title: 'Romans 8:28',
      date: DAY,
      source: 'personal',
      mainPassages: [passage],
    });
    await undoPlacement(placement, db);
    expect(await db.lesson.get(placement.lesson.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
  });

  it('keeps a section edited since, and only brings the item back', async () => {
    const shepherd = await lesson();
    const item = await addInboxItem({ origin: 'typed', ref: null, text: 'hesed' }, db);
    const placement = await sendToLesson(item.id, { lessonId: shepherd.id }, db);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateSection(
      placement.section.id,
      { body: { type: 'doc', content: [paragraph('hesed: steadfast love')] } },
      db,
    );
    await undoPlacement(placement, db);
    expect(await db.section.get(placement.section.id)).toMatchObject({ deletedAt: null });
    expect(await inboxCount(DAY, db)).toBe(1);
  });
});

describe('appending an item to a section', () => {
  it('adds it after the text, and Undo puts the text back as it was', async () => {
    const shepherd = await lesson();
    const before = { type: 'doc' as const, content: [paragraph('I am the good shepherd.')] };
    const section = await createSection(
      {
        lessonId: shepherd.id,
        parentId: null,
        orderKey: 'a0',
        body: before,
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const item = await addInboxItem({ origin: 'typed', ref: null, text: 'Look up "hesed"' }, db);

    const placement = await appendToSection(item.id, section.id, db);
    expect((await db.section.get(section.id))?.body.content).toEqual([
      paragraph('I am the good shepherd.'),
      paragraph('Look up "hesed"'),
    ]);
    expect(await inboxCount(DAY, db)).toBe(0);

    await undoPlacement(placement, db);
    expect((await db.section.get(section.id))?.body).toEqual(before);
    expect(await inboxCount(DAY, db)).toBe(1);
  });
});

describe('an item in a section', () => {
  it('is the chip then a paragraph a line, or only the lines without a chip', () => {
    expect(inboxItemBody({ ref: null, text: 'one\n\n two ' }).content).toEqual([
      paragraph('one'),
      paragraph('two'),
    ]);
    expect(inboxItemBody({ ref, text: null }).content).toEqual([
      { type: 'paragraph', content: [{ type: 'verse', attrs: ref }] },
    ]);
  });

  it('titles a new lesson with the reference, or the first line of the text', () => {
    expect(inboxItemTitle({ ref, text: 'note' })).toBe('Romans 8:28');
    expect(inboxItemTitle({ ref: null, text: '  Look up hesed\nbefore Sunday' })).toBe(
      'Look up hesed',
    );
    expect(inboxItemTitle({ ref: null, text: 'x'.repeat(100) })).toHaveLength(80);
  });
});
