import { keyBetween, type SectionBody, type VerseRef } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLesson } from '@/data/actions/lessons.ts';
import { addQuestion, setParked } from '@/data/actions/questions.ts';
import { createSection } from '@/data/actions/sections.ts';
import { createSeries } from '@/data/actions/series.ts';
import { addTag } from '@/data/actions/tags.ts';
import { createTakeaway } from '@/data/actions/takeaways.ts';
import { LampDb } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { exportLesson, exportSeries } from './load.ts';
import { fileName } from './markdown.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`export-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

const JOHN_10_9: VerseRef = {
  book: 'JHN',
  chapter: 10,
  verseStart: 9,
  display: 'John 10:9',
  translation: 'BSB',
  snapshotText:
    'I am the door. If anyone enters in by me, he will be saved, and will go in and go out, and will find pasture.',
};
const PSALM_23_1: VerseRef = {
  book: 'PSA',
  chapter: 23,
  verseStart: 1,
  display: 'Psalm 23:1',
  translation: 'BSB',
  snapshotText: 'Yahweh is my shepherd: I shall lack nothing.',
};

const text = (value: string, ...marks: ('bold' | 'italic')[]) => ({
  type: 'text' as const,
  text: value,
  ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
});
const verse = (attrs: VerseRef) => ({ type: 'verse' as const, attrs });
const body = (...content: SectionBody['content']): SectionBody => ({ type: 'doc', content });

/** The lesson the golden files show: every part of an export once. */
async function goodShepherd(seriesId: string | null) {
  const lesson = await createLesson(
    {
      seriesId,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      source: 'sermon',
      speaker: 'Pastor Ann',
      church: 'Grace Chapel',
      mainPassages: [
        {
          book: 'JHN',
          chapter: 10,
          verseStart: 1,
          verseEnd: 18,
          display: 'John 10:1–18',
          translation: 'BSB',
        },
      ],
    },
    db,
  );
  await addTag({ kind: 'lesson', id: lesson.id }, 'grace', db);

  const first = keyBetween(null, null);
  const door = await createSection(
    {
      lessonId: lesson.id,
      parentId: null,
      orderKey: first,
      body: body({
        type: 'paragraph',
        content: [
          text('Jesus is the door '),
          verse(JOHN_10_9),
          text(': '),
          text('salvation', 'bold'),
          text(' and pasture.'),
        ],
      }),
      conflictOf: null,
      conflictDevice: null,
    },
    db,
  );
  await addTag({ kind: 'section', id: door.id }, 'hope', db);
  await addTag({ kind: 'section', id: door.id }, 'Holy Spirit', db);
  await createSection(
    {
      lessonId: lesson.id,
      parentId: door.id,
      orderKey: first,
      body: body(
        {
          type: 'paragraph',
          content: [text('Compare '), verse(PSALM_23_1), text(': the same shepherd.')],
        },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [text('He leads')] }] },
          ],
        },
      ),
      conflictOf: null,
      conflictDevice: null,
    },
    db,
  );
  await createSection(
    {
      lessonId: lesson.id,
      parentId: null,
      orderKey: keyBetween(first, null),
      body: body(
        { type: 'heading', attrs: { level: 3 }, content: [text('Who are the “other sheep”?')] },
        { type: 'paragraph', content: [text('Other flocks, *one* shepherd.')] },
      ),
      conflictOf: null,
      conflictDevice: null,
    },
    db,
  );

  await createTakeaway({ lessonId: lesson.id, text: 'He knows his sheep by name.' }, db);
  await createTakeaway({ lessonId: lesson.id, text: '# Not a heading' }, db);
  const answered = await addQuestion(lesson.id, 'Who are the “other sheep”?', db);
  await db.question.update(answered.id, { status: 'answered' });
  await addQuestion(lesson.id, 'What is the door?', db);
  const parked = await addQuestion(lesson.id, 'Thief vs hired hand?', db);
  await setParked(parked.id, true, db);
  return lesson;
}

describe('Markdown export', () => {
  it('writes a lesson as the golden file shows', async () => {
    const lesson = await goodShepherd(null);
    const exported = await exportLesson(lesson.id, db);
    expect(exported?.fileName).toBe('2026-10-12-the-good-shepherd.md');
    await expect(exported?.markdown).toMatchFileSnapshot('./golden/lesson.md');
  });

  it('writes a series with its lessons in date order', async () => {
    const series = await createSeries(
      {
        title: 'John',
        description: 'Walking through John on Sundays.\nOne chapter a week.',
        kind: 'book_study',
      },
      db,
    );
    await goodShepherd(series.id);
    const vine = await createLesson(
      {
        seriesId: series.id,
        title: 'Abiding in the vine',
        date: '2026-10-05',
        source: 'sermon',
        speaker: null,
        church: null,
        mainPassages: [],
      },
      db,
    );
    await createTakeaway({ lessonId: vine.id, text: 'Abide, don’t strive.' }, db);
    const exported = await exportSeries(series.id, db);
    expect(exported?.fileName).toBe('john.md');
    await expect(exported?.markdown).toMatchFileSnapshot('./golden/series.md');
  });

  it('leaves out the credit when nothing quotes Scripture', async () => {
    const lesson = await createLesson(
      {
        seriesId: null,
        title: 'Notes',
        date: '2026-10-14',
        source: 'personal',
        speaker: null,
        church: null,
        mainPassages: [],
      },
      db,
    );
    expect((await exportLesson(lesson.id, db))?.markdown).toBe(
      '# Notes\n\nWednesday 14 October 2026 · Personal\n',
    );
  });

  it('credits only the translations Lamp has, not text from outside', async () => {
    const niv: VerseRef = { ...JOHN_10_9, translation: 'shared', versionLabel: 'NIV' };
    const lesson = await createLesson(
      {
        seriesId: null,
        title: 'Shared',
        date: '2026-10-14',
        source: 'personal',
        speaker: null,
        church: null,
        mainPassages: [niv],
      },
      db,
    );
    const markdown = (await exportLesson(lesson.id, db))?.markdown;
    expect(markdown).toContain('John 10:9');
    expect(markdown).not.toContain('Scripture:');
  });

  it('is null for a lesson or series that is gone', async () => {
    expect(await exportLesson('missing', db)).toBeNull();
    expect(await exportSeries('missing', db)).toBeNull();
  });
});

describe('fileName', () => {
  it('makes a safe, readable name', () => {
    expect(fileName('Romans 8: “No Condemnation”!', '2026-10-12')).toBe(
      '2026-10-12-romans-8-no-condemnation.md',
    );
    expect(fileName('Épître aux Romains')).toBe('epitre-aux-romains.md');
    expect(fileName('???')).toBe('lesson.md');
  });
});
