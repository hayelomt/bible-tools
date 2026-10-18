import { emptyBody, keyBetween, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLesson } from './actions/lessons.ts';
import { createSection } from './actions/sections.ts';
import { LampDb } from './db.ts';
import { ensureDevice } from './setup.ts';
import { forgetUnsaved, keepUnsaved, restoreUnsaved, type UnsavedSection } from './unsaved.ts';

const text = (t: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

let db: LampDb;
let dbCount = 0;
let lessonId: string;
let storage: Storage;

beforeEach(async () => {
  db = new LampDb(`unsaved-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  ({ id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      kind: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    },
    db,
  ));
  storage = window.localStorage;
  storage.clear();
});

afterEach(async () => {
  await db.delete();
});

const draft = (fields: Partial<UnsavedSection> = {}): UnsavedSection => ({
  id: '0199e000-0000-7000-8000-0000000000bb',
  lessonId,
  parentId: null,
  orderKey: keyBetween(null, null),
  body: text('Typed as the tab closed'),
  base: null,
  ...fields,
});

describe('unsaved section text', () => {
  it('stores a kept draft on the next start, and forgets it', async () => {
    keepUnsaved(draft(), storage);
    await restoreUnsaved(db, storage);
    expect((await db.section.get(draft().id))?.body).toEqual(draft().body);
    expect(storage.getItem('lamp.unsavedSections')).toBeNull();
  });

  it('applies kept text only to the row it was typed on', async () => {
    const { base: _, ...fields } = draft();
    const row = await createSection(
      { ...fields, body: emptyBody(), conflictOf: null, conflictDevice: null },
      db,
    );
    keepUnsaved(draft({ base: row.updatedAt, body: text('Lost write') }), storage);
    await restoreUnsaved(db, storage);
    expect((await db.section.get(row.id))?.body).toEqual(text('Lost write'));

    // The row changed after the text was kept (the write landed, or a newer change came).
    keepUnsaved(draft({ base: row.updatedAt, body: text('Stale') }), storage);
    await restoreUnsaved(db, storage);
    expect((await db.section.get(row.id))?.body).toEqual(text('Lost write'));
  });

  it('drops a draft whose lesson is gone', async () => {
    keepUnsaved(draft({ lessonId: '0199e000-0000-7000-8000-0000000000cc' }), storage);
    await restoreUnsaved(db, storage);
    expect(await db.section.count()).toBe(0);
    expect(storage.getItem('lamp.unsavedSections')).toBeNull();
  });

  it('forgets kept text once it is stored, but not newer kept text', async () => {
    keepUnsaved(draft({ body: text('newer') }), storage);
    forgetUnsaved(draft().id, text('older'), storage);
    expect(storage.getItem('lamp.unsavedSections')).toContain('newer');
    forgetUnsaved(draft().id, text('newer'), storage);
    expect(storage.getItem('lamp.unsavedSections')).toBeNull();
  });
});
