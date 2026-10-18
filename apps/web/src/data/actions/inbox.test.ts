import type { SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import youVersionFixture from '@/import/fixtures/youversion-guess.json' with { type: 'json' };
import { exportRecords, type ImportedItem, recordItems } from '@/import/youversion.ts';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import {
  addInboxItem,
  addShared,
  appendToSection,
  dismissImport,
  dismissInboxItem,
  importInboxItems,
  importItems,
  importLeftCount,
  inboxCount,
  inboxEntries,
  inboxItemBody,
  inboxItemTitle,
  inboxItems,
  inboxItemTags,
  dismissInboxItems,
  promoteInboxItem,
  promoteText,
  restoreInboxItem,
  restoreInboxItems,
  restoreSnoozes,
  sendToLesson,
  snoozedCount,
  snoozedItems,
  snoozeInboxItems,
  tagInboxItems,
  undoPlacement,
  undoShared,
  untagInboxItems,
} from './inbox.ts';
import { tagsOf } from '../queries.ts';
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
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
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
        sourceAt: null,
        sourcePage: null,
      },
      db,
    );
    const item = await addInboxItem({ origin: 'share', ref, text: 'From Sunday' }, db);

    const placement = await sendToLesson([item.id], { lessonId: shepherd.id }, db);
    expect(placement.placed[0]!.section).toMatchObject({ lessonId: shepherd.id, parentId: null });
    expect(placement.placed[0]!.section.orderKey > 'a0').toBe(true);
    expect(placement.placed[0]!.section.body).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'verse', attrs: ref }] },
        paragraph('From Sunday'),
      ],
    });
    expect(await db.inboxItem.get(item.id)).toMatchObject({
      placedInSectionId: placement.placed[0]!.section.id,
    });
    expect(await inboxCount(DAY, db)).toBe(0);
    // The section is indexed as usual.
    expect(
      await db.citation.where('sourceId').equals(placement.placed[0]!.section.id).count(),
    ).toBe(1);

    await undoPlacement(placement, db);
    expect(await db.section.get(placement.placed[0]!.section.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
    expect(await db.inboxItem.get(item.id)).toMatchObject({ placedInSectionId: null });
    expect(await inboxCount(DAY, db)).toBe(1);
  });

  it('makes a new personal lesson titled from the item, which Undo removes too', async () => {
    const item = await addInboxItem({ origin: 'share', ref, text: null }, db);
    const placement = await sendToLesson([item.id], { newLesson: { date: DAY } }, db);
    const { snapshotText: _text, ...passage } = ref;
    expect(placement.lesson).toMatchObject({
      title: 'Romans 8:28',
      date: DAY,
      kind: 'personal',
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
    const placement = await sendToLesson([item.id], { lessonId: shepherd.id }, db);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await updateSection(
      placement.placed[0]!.section.id,
      { body: { type: 'doc', content: [paragraph('hesed: steadfast love')] } },
      db,
    );
    await undoPlacement(placement, db);
    expect(await db.section.get(placement.placed[0]!.section.id)).toMatchObject({
      deletedAt: null,
    });
    expect(await inboxCount(DAY, db)).toBe(1);
  });
});

/** Fifty items, received a minute apart, oldest first. */
async function fifty() {
  const items = [];
  for (let i = 0; i < 50; i++) {
    const receivedAt = new Date(Date.UTC(2026, 9, 16, 9, i)).toISOString();
    items.push(
      await addInboxItem({ origin: 'typed', ref: null, text: `note ${i}`, receivedAt }, db),
    );
  }
  return items;
}

describe('triage (M11-02 to M11-04)', () => {
  it('sends fifty items to a lesson in one action, in the order received, with one Undo', async () => {
    const items = await fifty();
    const shepherd = await lesson();
    await db.outbox.clear();
    const placement = await sendToLesson(
      items.toReversed().map((item) => item.id),
      { lessonId: shepherd.id },
      db,
    );
    expect(placement.placed.map((p) => p.itemId)).toEqual(items.map((item) => item.id));
    const sections = (await db.section.where('lessonId').equals(shepherd.id).toArray()).toSorted(
      (a, b) => (a.orderKey < b.orderKey ? -1 : 1),
    );
    expect(sections.map((section) => section.body.content)).toEqual(
      items.map((item) => [paragraph(item.text!)]),
    );
    expect(await inboxCount(DAY, db)).toBe(0);

    await undoPlacement(placement, db);
    expect(await inboxCount(DAY, db)).toBe(50);
    expect(
      await db.section
        .where('lessonId')
        .equals(shepherd.id)
        .filter((s) => s.deletedAt === null)
        .count(),
    ).toBe(0);
  });

  it('makes a lesson from items, named as asked, and Undo removes it', async () => {
    const [first, second] = await fifty();
    const placement = await sendToLesson(
      [second!.id, first!.id],
      { newLesson: { date: DAY, title: 'Hesed' } },
      db,
    );
    expect(placement.lesson).toMatchObject({ title: 'Hesed', kind: 'personal', date: DAY });
    expect(placement.placed).toHaveLength(2);
    await undoPlacement(placement, db);
    expect(await db.lesson.get(placement.lesson.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
  });

  it('dismisses fifty items in one action, and Undo brings back exactly those', async () => {
    const items = await fifty();
    const earlier = await addInboxItem(
      { origin: 'typed', ref: null, text: 'dismissed before' },
      db,
    );
    await dismissInboxItem(earlier.id, db);
    const dismissed = await dismissInboxItems(
      items.map((item) => item.id),
      db,
    );
    expect(dismissed).toHaveLength(50);
    expect(await inboxCount(DAY, db)).toBe(0);
    await restoreInboxItems(dismissed, db);
    expect(await inboxCount(DAY, db)).toBe(50);
  });

  it('tags items, once each; placing one takes its tags into the section', async () => {
    const [a, b] = await fifty();
    const first = await tagInboxItems([a!.id], 'Hesed', db);
    const both = await tagInboxItems([a!.id, b!.id], 'hesed', db);
    expect(both.tag.id).toBe(first.tag.id);
    // The first had it already.
    expect(both.links).toHaveLength(1);
    expect((await inboxItemTags([a!.id, b!.id], db)).get(b!.id)?.map((t) => t.name)).toEqual([
      'Hesed',
    ]);

    const shepherd = await lesson();
    const placement = await sendToLesson([a!.id], { lessonId: shepherd.id }, db);
    const { section } = placement.placed[0]!;
    expect((await tagsOf({ kind: 'section', id: section.id }, db)).map((t) => t.tag.name)).toEqual([
      'Hesed',
    ]);
    await undoPlacement(placement, db);
    expect(await tagsOf({ kind: 'section', id: section.id }, db)).toEqual([]);

    await untagInboxItems(both.links, db);
    expect((await inboxItemTags([b!.id], db)).get(b!.id)).toBeUndefined();
  });

  it('makes a takeaway or a question from an item, placing the item, and Undo takes both', async () => {
    const shepherd = await lesson();
    const item = await addInboxItem(
      { origin: 'share', ref, text: 'All things  work\ntogether' },
      db,
    );
    expect(promoteText(item)).toBe('All things work together');
    expect(promoteText({ ref, text: null })).toBe('Romans 8:28');

    const asTakeaway = await promoteInboxItem(
      item.id,
      { lessonId: shepherd.id },
      'takeaway',
      'God works',
      db,
    );
    expect(asTakeaway.promoted).toMatchObject({
      kind: 'takeaway',
      takeaway: { text: 'God works' },
    });
    expect(await db.inboxItem.get(item.id)).toMatchObject({
      placedInSectionId: asTakeaway.placed[0]!.section.id,
    });
    // The chip stays cited, in its section.
    expect(await db.citation.where('lessonId').equals(shepherd.id).count()).toBe(1);
    await undoPlacement(asTakeaway, db);
    expect(await db.takeaway.filter((t) => t.deletedAt === null).count()).toBe(0);
    expect(await inboxCount(DAY, db)).toBe(1);

    const asQuestion = await promoteInboxItem(
      item.id,
      { newLesson: { date: DAY } },
      'question',
      'Which things?',
      db,
    );
    expect(asQuestion.promoted).toMatchObject({
      kind: 'question',
      question: { text: 'Which things?' },
    });
    const question =
      asQuestion.promoted!.kind === 'question' ? asQuestion.promoted!.question : null;
    expect(await db.questionEntry.where('questionId').equals(question!.id).toArray()).toMatchObject(
      [{ kind: 'asked', lessonId: asQuestion.lesson.id }],
    );
    await undoPlacement(asQuestion, db);
    expect(await db.question.get(question!.id)).toMatchObject({ deletedAt: expect.any(String) });
    expect(await db.lesson.get(asQuestion.lesson.id)).toMatchObject({
      deletedAt: expect.any(String),
    });
  });

  it('snoozes items until a day, lists them, and wakes them; Undo puts the snooze back', async () => {
    const [a, b] = await fifty();
    const before = await snoozeInboxItems([a!.id, b!.id], '2026-10-19', db);
    expect(before).toEqual([
      { id: a!.id, snoozedUntil: null },
      { id: b!.id, snoozedUntil: null },
    ]);
    expect(await inboxCount(DAY, db)).toBe(48);
    expect(await snoozedCount(DAY, db)).toBe(2);
    expect((await snoozedItems(DAY, db)).map((item) => item.id)).toEqual([b!.id, a!.id]);
    // Back on its day.
    expect(await inboxCount('2026-10-19', db)).toBe(50);
    expect(await snoozedCount('2026-10-19', db)).toBe(0);

    await snoozeInboxItems([a!.id], null, db);
    expect(await snoozedCount(DAY, db)).toBe(1);
    await restoreSnoozes(before, db);
    expect(await snoozedCount(DAY, db)).toBe(0);
  });

  it('leaves out items placed or dismissed meanwhile, and refuses when none are left', async () => {
    const [a, b] = await fifty();
    await dismissInboxItem(a!.id, db);
    expect(await dismissInboxItems([a!.id, b!.id], db)).toEqual([b!.id]);
    await expect(dismissInboxItems([a!.id, b!.id], db)).rejects.toThrow('No inboxItem');
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
        sourceAt: null,
        sourcePage: null,
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

describe('saving a share', () => {
  const shared = [
    { origin: 'share' as const, ref, text: 'For Sunday', sourceUrl: 'https://bible.com/x' },
    {
      origin: 'share' as const,
      ref: { ...ref, verseStart: 29, display: 'Romans 8:29' },
      text: null,
    },
  ];

  it('puts each item in the inbox, and Undo takes them out', async () => {
    const result = await addShared(shared, null, db);
    expect((await inboxItems(DAY, db)).map((item) => item.ref?.display)).toEqual([
      'Romans 8:28',
      'Romans 8:29',
    ]);
    expect(result.items[0]).toMatchObject({ text: 'For Sunday', sourceUrl: 'https://bible.com/x' });
    await undoShared(result, db);
    expect(await inboxCount(DAY, db)).toBe(0);
  });

  it('puts them in a lesson as sections, out of the inbox, and Undo takes it all back', async () => {
    const { id } = await lesson();
    const result = await addShared(shared, { lessonId: id }, db);
    expect(await inboxCount(DAY, db)).toBe(0);
    const sections = await db.section.where('lessonId').equals(id).toArray();
    expect(sections.map((section) => section.body.content.length)).toEqual([2, 1]);
    const placed = await Promise.all(result.items.map((item) => db.inboxItem.get(item.id)));
    expect(placed.map((item) => item?.placedInSectionId)).toEqual(
      result.sections.map((section) => section.id),
    );
    await undoShared(result, db);
    expect(
      (await db.section.where('lessonId').equals(id).toArray()).every((x) => x.deletedAt),
    ).toBe(true);
    expect((await db.inboxItem.toArray()).every((item) => item.deletedAt)).toBe(true);
    expect((await db.lesson.get(id))?.deletedAt).toBeNull();
  });

  it('makes one new lesson for them all, which Undo removes unless a section was edited', async () => {
    const result = await addShared(shared, { newLesson: { date: DAY } }, db);
    expect(result.lesson).toMatchObject({ title: 'Romans 8:28', kind: 'personal' });
    expect(result.lesson?.mainPassages.map((p) => p.display)).toEqual([
      'Romans 8:28',
      'Romans 8:29',
    ]);
    await updateSection(
      result.sections[1]!.id,
      { body: { type: 'doc', content: [paragraph('Mine')] } },
      db,
    );
    await undoShared(result, db);
    expect((await db.lesson.get(result.lesson!.id))?.deletedAt).toBeNull();
    expect((await db.section.get(result.sections[1]!.id))?.deletedAt).toBeNull();
    expect((await db.section.get(result.sections[0]!.id))?.deletedAt).not.toBeNull();
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

const imported = (): ImportedItem[] =>
  exportRecords(youVersionFixture).flatMap((r) => recordItems(r) ?? []);

describe('importInboxItems', () => {
  it('puts each item in the inbox with one import id, skipping a repeat in the file', async () => {
    const result = await importInboxItems(imported(), db);
    expect(result).toMatchObject({ added: 8, skipped: 1 });
    const rows = await db.inboxItem.toArray();
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((row) => row.importId))).toEqual(new Set([result.importId]));
    expect(rows.every((row) => row.origin === 'import')).toBe(true);
    expect(await db.inboxItem.where('importId').equals(result.importId).count()).toBe(8);
    // The newest first, by the dates in the export.
    expect((await inboxItems(DAY, db))[0]!.text).toBe('Sermon idea: waiting well.');
  });

  it('adds nothing the second time, dismissed items included', async () => {
    await importInboxItems(imported(), db);
    const [first] = await inboxItems(DAY, db);
    await dismissInboxItem(first!.id, db);
    expect(await importInboxItems(imported(), db)).toMatchObject({ added: 0, skipped: 9 });
    expect(await db.inboxItem.count()).toBe(8);
  });
});

const typed = (text: string, receivedAt: string) =>
  addInboxItem({ origin: 'typed', ref: null, text, receivedAt }, db);

describe('an import in the inbox', () => {
  it('is one row, placed by when it ran, and opens its items oldest first', async () => {
    await typed('Older', '2000-01-01T00:00:00.000Z');
    const { importId } = await importInboxItems(imported(), db);
    await typed('Newer', '2099-01-01T00:00:00.000Z');
    const entries = await inboxEntries(DAY, db);
    expect(entries.map((e) => (e.kind === 'item' ? e.item.text : e.group.count))).toEqual([
      'Newer',
      8,
      'Older',
    ]);
    // The badge still counts each item.
    expect(await inboxCount(DAY, db)).toBe(10);

    const opened = await importItems(importId, DAY, db);
    const row = entries[1]!;
    expect(row.kind === 'import' && row.group.importedAt).toBe(opened!.importedAt);
    const dates = opened!.items.map((item) => item.receivedAt);
    expect(dates).toEqual(dates.toSorted());
    expect(dates).toHaveLength(8);
    expect(await importItems('no-such-import', DAY, db)).toBeNull();
  });

  it('is dismissed all at once, leaving placed and other items, and Undo brings back the same', async () => {
    await typed('Mine', '2000-01-01T00:00:00.000Z');
    const { importId } = await importInboxItems(imported(), db);
    const [placed, dismissed] = (await importItems(importId, DAY, db))!.items;
    await sendToLesson([placed!.id], { lessonId: (await lesson()).id }, db);
    await dismissInboxItem(dismissed!.id, db);
    expect(await importLeftCount(importId, db)).toBe(6);

    await db.outbox.clear();
    const ids = await dismissImport(importId, db);
    expect(ids).toHaveLength(6);
    expect((await inboxEntries(DAY, db)).map((e) => e.kind === 'item' && e.item.text)).toEqual([
      'Mine',
    ]);
    expect((await db.inboxItem.get(placed!.id))!.placedInSectionId).not.toBeNull();
    expect(await db.outbox.count()).toBe(6);
    expect(await importItems(importId, DAY, db)).toEqual(expect.objectContaining({ items: [] }));

    await restoreInboxItems(ids, db);
    expect((await importItems(importId, DAY, db))!.items).toHaveLength(6);
    // The one dismissed alone stays dismissed.
    expect((await db.inboxItem.get(dismissed!.id))!.deletedAt).not.toBeNull();
  });
});
