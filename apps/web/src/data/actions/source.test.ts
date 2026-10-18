import { keyBetween } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { midnightOf, offsetLabel } from '@/lib/source-time.ts';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import { setSourceStart } from './capture.ts';
import { createLesson } from './lessons.ts';
import { createSection } from './sections.ts';
import { setSectionMoment } from './source.ts';

let db: LampDb;
let dbCount = 0;
let lessonId: string;
let sectionId: string;

beforeEach(async () => {
  db = new LampDb(`source-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  ({ id: lessonId } = await createLesson(
    {
      seriesId: null,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: 'sermon',
      sourceTitle: 'Sunday service',
      sourceAuthor: null,
      sourceUrl: 'https://youtu.be/abc123',
      sourceStartedAt: null,
      mainPassages: [],
    },
    db,
  ));
  ({ id: sectionId } = await createSection(
    {
      lessonId,
      parentId: null,
      orderKey: keyBetween(null, null),
      body: { type: 'doc', content: [{ type: 'paragraph' }] },
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  ));
});

afterEach(async () => {
  await db.delete();
});

describe('a section’s time or page (M11-07)', () => {
  it('anchors a lesson without a start at midnight on its date, so the time reads as typed', async () => {
    const section = await setSectionMoment(sectionId, { kind: 'time', ms: 585_000 }, db);
    const lesson = await db.lesson.get(lessonId);
    expect(lesson?.sourceStartedAt).toBe(midnightOf('2026-10-12'));
    expect(offsetLabel(section.sourceAt!, lesson!.sourceStartedAt!)).toBe('09:45');
    expect(section.sourcePage).toBeNull();

    // Moving the start moves the time.
    const later = new Date(Date.parse(lesson!.sourceStartedAt!) + 45_000).toISOString();
    await setSourceStart(lessonId, later, db);
    expect(offsetLabel(section.sourceAt!, later)).toBe('09:00');
  });

  it('keeps a lesson’s start, and a page replaces a time', async () => {
    const start = '2026-10-12T09:30:00.000Z';
    await setSourceStart(lessonId, start, db);
    const timed = await setSectionMoment(sectionId, { kind: 'time', ms: 60_000 }, db);
    expect(timed.sourceAt).toBe('2026-10-12T09:31:00.000Z');
    expect((await db.lesson.get(lessonId))?.sourceStartedAt).toBe(start);

    const paged = await setSectionMoment(sectionId, { kind: 'page', page: '112' }, db);
    expect(paged).toMatchObject({ sourceAt: null, sourcePage: '112' });
    const removed = await setSectionMoment(sectionId, null, db);
    expect(removed).toMatchObject({ sourceAt: null, sourcePage: null });
  });
});
