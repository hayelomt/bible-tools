import {
  BUILT_IN_TEMPLATES,
  headedBody,
  keyBetween,
  type Paragraph,
  type SectionBody,
  toPlainText,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { lessonSections, readingOrder } from '../queries.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson, updateLesson } from './lessons.ts';
import { createSection, removeSection, updateSection } from './sections.ts';
import { updateSettings } from './settings.ts';
import { addTag } from './tags.ts';
import {
  applyTemplate,
  createTemplate,
  deleteTemplate,
  removeApplied,
  restoreTemplate,
  saveLessonAsTemplate,
  templateByKey,
  updateTemplate,
} from './templates.ts';

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
      kind: 'personal',
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

const LESSON = {
  seriesId: null,
  title: 'John 10',
  date: '2026-10-12',
  kind: 'group' as const,
  speaker: null,
  church: null,
  mainPassages: [],
};

/** A paragraph of text; as a whole body with `body`. */
function paragraph(text: string): Paragraph;
function paragraph(text: string, body: true): SectionBody;
function paragraph(text: string, body = false): Paragraph | SectionBody {
  const block: Paragraph = { type: 'paragraph', content: [{ type: 'text', text }] };
  return body ? { type: 'doc', content: [block] } : block;
}

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

const SERMON_NOTES = [
  { title: 'Main point' },
  { title: 'Points', children: [{ title: 'One' }, { title: 'Two' }] },
  { title: 'Response' },
];

describe('the user’s own templates (M10-13)', () => {
  it('are made, renamed, deleted and restored, each one queued change', async () => {
    const made = await createTemplate({ name: 'Sermon notes', structure: SERMON_NOTES }, db);
    expect(await templateByKey(made.id, db)).toMatchObject({ key: made.id, name: 'Sermon notes' });
    await updateTemplate(made.id, { name: 'Notes' }, db);
    await deleteTemplate(made.id, db);
    expect(await templateByKey(made.id, db)).toBeNull();
    await restoreTemplate(made.id, db);
    expect(await templateByKey(made.id, db)).toMatchObject({ name: 'Notes' });
    expect((await db.outbox.toArray()).map((e) => [e.entity, e.op])).toEqual([
      ['template', 'upsert'],
      ['template', 'upsert'],
      ['template', 'delete'],
      ['template', 'upsert'],
    ]);
    expect(await templateByKey('builtin:soap', db)).toMatchObject({ name: 'SOAP' });
    expect(await templateByKey(null, db)).toBeNull();
  });

  it('a lesson saved as a template keeps its headings and replies, not the text', async () => {
    await applyTemplate(lessonId, SERMON_NOTES, { after: null, before: null }, db);
    const [first] = await lessonSections(lessonId, db);
    await updateSection(
      first!.id,
      { body: { ...first!.body, content: [first!.body.content[0]!, paragraph('Grace')] } },
      db,
    );
    await createSection(
      {
        lessonId,
        parentId: null,
        orderKey: keyBetween(null, first!.orderKey),
        body: paragraph('Unheaded', true),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const saved = await saveLessonAsTemplate(lessonId, 'From Psalm 23', db);
    expect(saved).toMatchObject({ name: 'From Psalm 23', structure: SERMON_NOTES });

    const empty = await createLesson({ ...LESSON, title: 'Empty' }, db);
    expect(await saveLessonAsTemplate(empty.id, 'Nothing', db)).toBeNull();
  });
});

/** A lesson's sections as it reads, replies indented. */
const titles = async (id: string) => {
  const sections = await lessonSections(id, db);
  return readingOrder(sections, sections).map(
    (s) => `${s.parentId ? '  ' : ''}${toPlainText(s.body)}`,
  );
};

describe('a default template per kind (M10-14)', () => {
  beforeEach(async () => {
    const notes = await createTemplate({ name: 'Sermon notes', structure: SERMON_NOTES }, db);
    await updateSettings(
      { defaultTemplates: { sermon: notes.id, personal: 'builtin:soap', group: null } },
      db,
    );
  });

  it('starts a new lesson of that kind with it; a kind without one starts empty', async () => {
    const personal = await createLesson({ ...LESSON, kind: 'personal' }, db);
    expect(await titles(personal.id)).toEqual(SOAP.structure.map((s) => s.title));
    const sermon = await createLesson({ ...LESSON, kind: 'sermon' }, db);
    expect(await titles(sermon.id)).toEqual(['Main point', 'Points', '  One', '  Two', 'Response']);
    const group = await createLesson({ ...LESSON, kind: 'group' }, db);
    expect(await titles(group.id)).toEqual([]);
  });

  it('a deleted template counts as none', async () => {
    const settings = await db.userSettings.get('settings');
    await deleteTemplate(settings!.defaultTemplates.sermon!, db);
    const sermon = await createLesson({ ...LESSON, kind: 'sermon' }, db);
    expect(await titles(sermon.id)).toEqual([]);
  });

  it('a new kind swaps in its default while the old one is untouched', async () => {
    const lesson = await createLesson({ ...LESSON, kind: 'sermon' }, db);
    await updateLesson(lesson.id, { kind: 'personal' }, db);
    expect(await titles(lesson.id)).toEqual(SOAP.structure.map((s) => s.title));
    await updateLesson(lesson.id, { kind: 'group' }, db);
    expect(await titles(lesson.id)).toEqual([]);
    await updateLesson(lesson.id, { kind: 'personal' }, db);
    expect(await titles(lesson.id)).toEqual(SOAP.structure.map((s) => s.title));
  });

  it('keeps a lesson’s sections once anything is written or tagged in them', async () => {
    const written = await createLesson({ ...LESSON, kind: 'personal' }, db);
    const [scripture] = await lessonSections(written.id, db);
    await updateSection(
      scripture!.id,
      { body: { ...scripture!.body, content: [scripture!.body.content[0]!, paragraph('Ps 23')] } },
      db,
    );
    await updateLesson(written.id, { kind: 'sermon' }, db);
    expect(await titles(written.id)).toEqual([
      'Scripture\nPs 23',
      'Observation',
      'Application',
      'Prayer',
    ]);

    const tagged = await createLesson({ ...LESSON, kind: 'personal' }, db);
    const [first] = await lessonSections(tagged.id, db);
    await addTag({ kind: 'section', id: first!.id }, 'grace', db);
    await updateLesson(tagged.id, { kind: 'sermon' }, db);
    expect(await titles(tagged.id)).toEqual(SOAP.structure.map((s) => s.title));

    // Another kind's sections, or a template applied by hand, aren't the old default.
    const other = await createLesson({ ...LESSON, kind: 'group' }, db);
    await applyTemplate(other.id, SOAP.structure, { after: null, before: null }, db);
    await updateLesson(other.id, { kind: 'sermon' }, db);
    expect(await titles(other.id)).toEqual(SOAP.structure.map((s) => s.title));
  });
});
