import { highlightSchema } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import {
  createHighlight,
  promoteHighlight,
  removeHighlight,
  restoreHighlight,
  updateHighlight,
} from './highlights.ts';
import { createLesson } from './lessons.ts';
import { createSection, removeSection } from './sections.ts';

let db: LampDb;
let dbCount = 0;

const ref = {
  book: 'JHN' as const,
  chapter: 10,
  verseStart: 11,
  verseEnd: 12,
  display: 'John 10:11–12',
  translation: 'BSB' as const,
  snapshotText: 'I am the good shepherd. He who is a hired hand…',
};

beforeEach(async () => {
  db = new LampDb(`highlights-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const citations = () => db.citation.filter((row) => row.sourceType === 'highlight').toArray();

describe('highlights', () => {
  it('are stored with a citation and an outbox change, then edited, removed and restored', async () => {
    const row = await createHighlight(
      { ref, colour: 'yellow', note: null, promotedSectionId: null },
      db,
    );
    expect(row.colour).toBe('yellow');
    expect(row.note).toBeNull();

    const indexed = await citations();
    expect(indexed).toHaveLength(1);
    expect(indexed[0]).toMatchObject({ sourceId: row.id, book: 'JHN', lessonId: null });
    expect(indexed[0]!.startOrd).toBeLessThan(indexed[0]!.endOrd);

    const painted = await updateHighlight(row.id, { colour: 'green' }, db);
    expect(painted.ref).toEqual(ref);
    const noted = await updateHighlight(row.id, { note: 'memorise this' }, db);
    expect(noted).toMatchObject({ colour: 'green', note: 'memorise this' });

    const queued = await db.outbox.toArray();
    expect(queued.map((change) => `${change.entity} ${change.op}`)).toEqual([
      'highlight upsert',
      'highlight upsert',
      'highlight upsert',
    ]);
    // What a push sends: the row without its rev, which the server already accepts.
    for (const change of queued) {
      if (change.op !== 'upsert') continue;
      expect(highlightSchema.omit({ rev: true }).safeParse(change.row).success).toBe(true);
    }

    await removeHighlight(row.id, db);
    expect((await db.highlight.get(row.id))?.deletedAt).not.toBeNull();
    expect(await citations()).toEqual([]);

    await restoreHighlight(row.id, db);
    expect((await db.highlight.get(row.id))?.deletedAt).toBeNull();
    expect(await citations()).toHaveLength(1);
  });
});

describe('promoting a highlight', () => {
  const lessonFields = {
    seriesId: null,
    title: 'The Good Shepherd',
    date: '2026-10-12',
    source: 'sermon' as const,
    speaker: null,
    church: null,
    mainPassages: [],
  };

  it('adds a section with the chip and the note at the end of a lesson, and links it', async () => {
    const lesson = await createLesson(lessonFields, db);
    const first = await createSection(
      {
        lessonId: lesson.id,
        parentId: null,
        orderKey: 'a0',
        body: { type: 'doc', content: [{ type: 'paragraph' }] },
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const highlight = await createHighlight(
      {
        ref,
        colour: 'green',
        note: 'Lays down his life.\n\nFor the sheep.',
        promotedSectionId: null,
      },
      db,
    );

    const { section } = await promoteHighlight(highlight.id, { lessonId: lesson.id }, db);
    expect(section.lessonId).toBe(lesson.id);
    expect(section.parentId).toBeNull();
    expect(section.orderKey > first.orderKey).toBe(true);
    expect(section.body.content).toEqual([
      { type: 'paragraph', content: [{ type: 'verse', attrs: ref }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Lays down his life.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'For the sheep.' }] },
    ]);
    expect((await db.highlight.get(highlight.id))?.promotedSectionId).toBe(section.id);
    // The section cites the verse in its lesson, like a chip typed there.
    const cited = await db.citation.where('sourceId').equals(section.id).toArray();
    expect(cited).toEqual([
      expect.objectContaining({ sourceType: 'section', lessonId: lesson.id }),
    ]);

    // Again: the same section, not a second.
    const again = await promoteHighlight(highlight.id, { lessonId: lesson.id }, db);
    expect(again.section.id).toBe(section.id);
    expect(await db.section.where('lessonId').equals(lesson.id).count()).toBe(2);

    // Once that section is deleted, the highlight can be added again.
    await removeSection(section.id, {}, db);
    const readded = await promoteHighlight(highlight.id, { lessonId: lesson.id }, db);
    expect(readded.section.id).not.toBe(section.id);
    expect((await db.highlight.get(highlight.id))?.promotedSectionId).toBe(readded.section.id);
  });

  it('creates a personal lesson titled with the reference, the passage as its main passage', async () => {
    const highlight = await createHighlight(
      { ref, colour: 'yellow', note: null, promotedSectionId: null },
      db,
    );
    const { lesson, section } = await promoteHighlight(
      highlight.id,
      { newLesson: { date: '2026-10-14' } },
      db,
    );
    expect(lesson).toMatchObject({
      title: 'John 10:11–12',
      date: '2026-10-14',
      source: 'personal',
      seriesId: null,
      mainPassages: [
        {
          book: 'JHN',
          chapter: 10,
          verseStart: 11,
          verseEnd: 12,
          display: 'John 10:11–12',
          translation: 'BSB',
        },
      ],
    });
    expect(lesson.mainPassages[0]).not.toHaveProperty('snapshotText');
    expect(section.body.content).toHaveLength(1);
    // What a push sends is valid for every row the promotion wrote.
    const queued = await db.outbox.toArray();
    expect(queued.map((change) => change.entity).toSorted()).toEqual([
      'highlight',
      'highlight',
      'lesson',
      'section',
    ]);
  });
});
