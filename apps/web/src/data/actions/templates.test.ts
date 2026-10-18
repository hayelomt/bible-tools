import { BUILT_IN_TEMPLATES, headedBody, keyBetween, toPlainText } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { lessonSections, readingOrder } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson } from './lessons.ts';
import { createSection, removeSection, updateSection } from './sections.ts';
import { applyTemplate, removeApplied } from './templates.ts';

let db: LampDb;
let dbCount = 0;
let lessonId: string;

beforeEach(async () => {
  db = new LampDb(`templates-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  ({ id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'Psalm 23',
      date: '2026-10-12',
      source: 'personal',
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

/** The lesson as it reads: each section's text, replies indented. */
const outline = async () => {
  const sections = await lessonSections(lessonId, db);
  return readingOrder(sections, sections).map(
    (s) => `${s.parentId ? '  ' : ''}${toPlainText(s.body)}`,
  );
};

const SOAP = BUILT_IN_TEMPLATES.find((t) => t.key === 'builtin:soap')!;

describe('applyTemplate', () => {
  it.each(BUILT_IN_TEMPLATES)('makes $name’s sections in order, each a heading', async (t) => {
    const ids = await applyTemplate(lessonId, t.structure, { after: null, before: null }, db);
    expect(await outline()).toEqual(t.structure.map((s) => s.title));
    const sections = await db.section.bulkGet(ids);
    expect(sections.map((s) => s!.body)).toEqual(t.structure.map((s) => headedBody(s.title)));
    // One action: each section queued once.
    expect(await db.outbox.count()).toBe(t.structure.length);
  });

  it('nests children as replies, and goes between the sections it’s placed between', async () => {
    const first = await createSection(
      {
        lessonId,
        parentId: null,
        orderKey: 'a0',
        body: headedBody('Before'),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    await createSection(
      {
        lessonId,
        parentId: null,
        orderKey: keyBetween('a0', null),
        body: headedBody('After'),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const firstId = '0199e0a0-0000-7000-8000-000000000001';
    const ids = await applyTemplate(
      lessonId,
      [
        { title: 'Main point' },
        { title: 'Points', children: [{ title: 'One' }, { title: 'Two' }] },
        { title: 'Response' },
      ],
      { after: first.orderKey, before: keyBetween('a0', null), firstId },
      db,
    );
    expect(ids[0]).toBe(firstId);
    expect(await outline()).toEqual([
      'Before',
      'Main point',
      'Points',
      '  One',
      '  Two',
      'Response',
      'After',
    ]);
  });

  it('leaves ordinary sections, which edit, move and delete like any other', async () => {
    const [scripture, observation] = await applyTemplate(
      lessonId,
      SOAP.structure,
      { after: null, before: null },
      db,
    );
    await updateSection(
      scripture!,
      {
        body: {
          type: 'doc',
          content: [
            headedBody('Scripture').content[0]!,
            { type: 'paragraph', content: [{ type: 'text', text: 'The Lord is my shepherd.' }] },
          ],
        },
      },
      db,
    );
    // Observation becomes a reply to Scripture; Prayer is deleted.
    await updateSection(observation!, { parentId: scripture!, orderKey: 'a0' }, db);
    const prayer = (await lessonSections(lessonId, db)).find(
      (s) => toPlainText(s.body) === 'Prayer',
    )!;
    await removeSection(prayer.id, {}, db);
    expect(await outline()).toEqual([
      'Scripture\nThe Lord is my shepherd.',
      '  Observation',
      'Application',
    ]);
  });
});

describe('removeApplied', () => {
  it('takes the sections back out, replies too, in one action', async () => {
    const ids = await applyTemplate(
      lessonId,
      [{ title: 'Points', children: [{ title: 'One' }] }, { title: 'Response' }],
      { after: null, before: null },
      db,
    );
    await db.outbox.clear();
    await removeApplied(ids, db);
    expect(await outline()).toEqual([]);
    expect(await db.outbox.count()).toBe(3);
  });
});
