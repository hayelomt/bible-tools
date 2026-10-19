import { formatPassage, keyBetween, type Passage, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LampDb } from '../db.ts';
import { ensureDevice } from '../setup.ts';
import { createLesson } from './lessons.ts';
import { clearPrep, prepLesson, prepOf, restorePrep, sermonDay, startPrep } from './prep.ts';
import { addQuestion, parkQuestion } from './questions.ts';
import { createSection } from './sections.ts';
import { createSeries } from './series.ts';
import { updateSettings } from './settings.ts';
import { addTag } from './tags.ts';
import { createTakeaway } from './takeaways.ts';

let db: LampDb;
let dbCount = 0;

/** Monday 19 October 2026. */
const MONDAY = '2026-10-19';
const john = (chapter: number, verseStart?: number, verseEnd?: number): Passage => ({
  book: 'JHN',
  chapter,
  ...(verseStart !== undefined ? { verseStart } : {}),
  ...(verseEnd !== undefined ? { verseEnd } : {}),
});
const ref = (p: Passage) => ({ ...p, display: formatPassage(p), translation: 'BSB' as const });
const body = (text: string, cites?: Passage): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        ...(text ? [{ type: 'text' as const, text }] : []),
        ...(cites ? [{ type: 'verse' as const, attrs: ref(cites) }] : []),
      ],
    },
  ],
});

async function lesson(
  title: string,
  date: string,
  passages: Passage[] = [],
  more: { seriesId?: string; kind?: 'sermon' | 'personal' } = {},
) {
  return createLesson(
    {
      seriesId: more.seriesId ?? null,
      title,
      date,
      kind: more.kind ?? 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: passages.map(ref),
    },
    db,
  );
}

let last: string | null = null;
function section(lessonId: string, content: SectionBody) {
  last = keyBetween(last, null);
  return createSection(
    {
      lessonId,
      parentId: null,
      orderKey: last,
      body: content,
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  );
}

beforeEach(async () => {
  db = new LampDb(`prep-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

describe('the sermon’s day', () => {
  it('is the next Sunday, or today on a Sunday', () => {
    expect(sermonDay(MONDAY)).toBe('2026-10-25');
    expect(sermonDay('2026-10-24')).toBe('2026-10-25');
    expect(sermonDay('2026-10-25')).toBe('2026-10-25');
  });
});

describe('the prep’s draft (M11-09)', () => {
  it('is the nearest lesson from today with a passage and nothing written', async () => {
    await lesson('Past', '2026-10-18', [john(10)]);
    await lesson('No passage', '2026-10-20');
    const written = await lesson('Written', '2026-10-21', [john(9)]);
    await section(written.id, body('Notes'));
    const later = await lesson('Later', '2026-11-01', [john(12)]);
    const nearest = await lesson('Nearest', '2026-10-25', [john(11)]);
    await section(nearest.id, body(''));

    expect((await prepLesson(MONDAY, db))?.id).toBe(nearest.id);
    await section(nearest.id, body('The resurrection and the life'));
    expect((await prepLesson(MONDAY, db))?.id).toBe(later.id);
  });

  it('clears with a takeaway, a question, or once its day is past', async () => {
    const draft = await lesson('Draft', '2026-10-25', [john(11)]);
    expect((await prepLesson('2026-10-25', db))?.id).toBe(draft.id);
    expect(await prepLesson('2026-10-26', db)).toBeNull();

    await createTakeaway({ lessonId: draft.id, text: 'Jesus wept' }, db);
    expect(await prepLesson(MONDAY, db)).toBeNull();
  });

  it('starts as a sermon on the passage, on Sunday, in the last series used, without a template', async () => {
    const series = await createSeries(
      { title: 'John', description: '', kind: 'sermon_series' },
      db,
    );
    await lesson('The Good Shepherd', '2026-10-11', [john(10)], { seriesId: series.id });
    await lesson('Personal study', '2026-10-15', [], { kind: 'personal' });
    await updateSettings(
      { defaultTemplates: { sermon: 'builtin:soap', personal: null, group: null } },
      db,
    );

    const draft = await startPrep(ref(john(11, 1, 44)), MONDAY, db);
    expect(draft).toMatchObject({
      title: 'John 11:1–44',
      date: '2026-10-25',
      kind: 'sermon',
      seriesId: series.id,
    });
    expect(draft.mainPassages.map((p) => p.display)).toEqual(['John 11:1–44']);
    expect(await db.section.where('lessonId').equals(draft.id).count()).toBe(0);
  });
});

describe('what the card shows', () => {
  it('counts the commentary, open questions and tags on the passage, and the last in the series', async () => {
    const series = await createSeries(
      { title: 'John', description: '', kind: 'sermon_series' },
      db,
    );
    const shepherd = await lesson('The Good Shepherd', '2026-10-11', [john(10)], {
      seriesId: series.id,
    });
    const lazarus = await lesson('Lazarus, years ago', '2025-03-02', [john(11)]);
    const study = await lesson('A study', '2026-06-01');

    const raised = await section(lazarus.id, body('Raised ', john(11, 43)));
    await section(lazarus.id, body('Wept ', john(11, 35)));
    const other = await section(study.id, body('Bethany ', john(11, 1)));
    await section(shepherd.id, body('Door ', john(10, 9)));
    await addTag({ kind: 'section', id: raised.id }, 'hope', db);
    await addTag({ kind: 'section', id: other.id }, 'hope', db);
    await addTag({ kind: 'section', id: other.id }, 'death', db);

    // A question in a lesson on the passage (its main passage), one parked, one elsewhere.
    await addQuestion(lazarus.id, 'Why did Jesus wait two days?', db);
    const parked = await addQuestion(lazarus.id, 'Where was Bethany?', db);
    await parkQuestion(parked.id, db);
    await addQuestion(shepherd.id, 'Who is the hired hand?', db);

    const draft = await lesson('John 11', '2026-10-25', [john(11)], { seriesId: series.id });
    const prep = await prepOf(MONDAY, db);

    expect(prep?.lesson.id).toBe(draft.id);
    expect(prep).toMatchObject({ sections: 3, lessons: 2 });
    expect(prep?.questions.map((q) => q.text)).toEqual(['Why did Jesus wait two days?']);
    expect(prep?.tags.map((t) => t.name)).toEqual(['hope', 'death']);
    expect(prep?.last?.lesson.id).toBe(shepherd.id);
    expect(prep?.last?.series.title).toBe('John');
  });

  it('is empty on a passage with nothing on it', async () => {
    await lesson('John 11', '2026-10-25', [john(11)]);
    expect(await prepOf(MONDAY, db)).toMatchObject({
      sections: 0,
      lessons: 0,
      questions: [],
      tags: [],
      last: null,
    });
  });
});

describe('✕', () => {
  it('deletes the draft and its empty sections, and Undo brings them back', async () => {
    const draft = await lesson('John 11', '2026-10-25', [john(11)]);
    const empty = await section(draft.id, body(''));
    await addTag({ kind: 'lesson', id: draft.id }, 'easter', db);

    const cleared = await clearPrep(draft.id, db);
    expect(await prepOf(MONDAY, db)).toBeNull();
    expect((await db.section.get(empty.id))?.deletedAt).not.toBeNull();

    await restorePrep(cleared, db);
    expect((await prepOf(MONDAY, db))?.lesson.id).toBe(draft.id);
    expect((await db.section.get(empty.id))?.deletedAt).toBeNull();
    expect((await db.lessonTag.where('lessonId').equals(draft.id).first())?.deletedAt).toBeNull();
  });
});
