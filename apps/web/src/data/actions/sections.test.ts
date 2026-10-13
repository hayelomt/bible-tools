import { emptyBody, keyBetween, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { action } from '../action.ts';
import { LampDb } from '../db.ts';
import { lessonSections } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson } from './lessons.ts';
import { createSection, removeSection, updateSection } from './sections.ts';

const text = (t: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

let db: LampDb;
let dbCount = 0;
let lessonId: string;

beforeEach(async () => {
  db = new LampDb(`sections-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { themePreset: 'parchment', colorMode: 'system' });
  ({ id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      source: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    },
    db,
  ));
  await db.outbox.clear();
});

afterEach(async () => {
  await db.delete();
});

const section = (fields: { id?: string; parentId?: string | null; body?: SectionBody } = {}) =>
  createSection(
    {
      lessonId,
      parentId: null,
      orderKey: keyBetween(null, null),
      body: emptyBody(),
      conflictOf: null,
      ...fields,
    },
    db,
  );

describe('sections', () => {
  it('stores a section with the id the editor gave its draft, and queues it', async () => {
    const id = '0199e000-0000-7000-8000-0000000000aa';
    await section({ id, body: text('Jesus is the door') });
    expect((await lessonSections(lessonId, db)).map((s) => s.id)).toEqual([id]);
    expect(await db.outbox.toArray()).toMatchObject([{ entity: 'section', entityId: id }]);
  });

  it('updates the body, and moves a section under another', async () => {
    const parent = await section({ body: text('A') });
    const { id } = await section({ body: text('B') });
    await updateSection(id, { body: text('B, edited') }, db);
    await updateSection(id, { parentId: parent.id, orderKey: keyBetween(null, null) }, db);
    const stored = await db.section.get(id);
    expect(stored).toMatchObject({ parentId: parent.id, body: text('B, edited') });
  });

  it('refuses a body the schema rejects, and stores nothing', async () => {
    const bad = { type: 'doc', content: [{ type: 'codeBlock' }] } as unknown as SectionBody;
    await expect(section({ body: bad })).rejects.toThrow('Invalid discriminator value');
    expect(await db.section.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
  });

  it('removes an emptied section with its tags, but not one with replies', async () => {
    const { id } = await section();
    const tag = (await db.tag.toArray())[0]!;
    await action(db, (w) => w.create('sectionTag', { tagId: tag.id, sectionId: id }));
    await removeSection(id, db);
    expect(await lessonSections(lessonId, db)).toEqual([]);
    expect((await db.sectionTag.toArray()).every((t) => t.deletedAt !== null)).toBe(true);

    const parent = await section();
    await section({ parentId: parent.id });
    await expect(removeSection(parent.id, db)).rejects.toThrow('has replies');
    expect(await lessonSections(lessonId, db)).toHaveLength(2);
  });
});
