import { keyBetween, type NoteLinkAttrs, type SectionBody } from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { linkOptions } from '@/components/links/link-options.ts';
import { exportLesson } from '@/export/load.ts';
import type { TextHit } from '@/search/text-index.ts';
import { createLesson, deleteLesson, updateLesson } from './actions/lessons.ts';
import { createSection, removeSection, updateSection } from './actions/sections.ts';
import { LampDb } from './db.ts';
import { firstWords, linkedFrom, linkTarget } from './links.ts';
import { ensureDevice } from './setup.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`links-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

const lessonOn = (title: string, date: string) =>
  createLesson(
    {
      seriesId: null,
      title,
      date,
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

const to = (
  targetType: 'lesson' | 'section',
  targetId: string,
  label = 'Old title',
): NoteLinkAttrs => ({
  targetType,
  targetId,
  label,
});

const bodyWith = (text: string, ...links: NoteLinkAttrs[]): SectionBody => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text },
        ...links.map((attrs) => ({ type: 'noteLink' as const, attrs })),
      ],
    },
  ],
});

let order: string | null = null;
const sectionIn = (lessonId: string, body: SectionBody) => {
  order = keyBetween(order, null);
  return createSection(
    {
      lessonId,
      parentId: null,
      orderKey: order,
      body,
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    },
    db,
  );
};

describe('the link index', () => {
  it('follows a section’s body as it is written, edited and deleted', async () => {
    const shepherd = await lessonOn('The Good Shepherd', '2026-10-12');
    const lazarus = await lessonOn('Lazarus', '2026-10-19');
    const section = await sectionIn(lazarus.id, bodyWith('Same as ', to('lesson', shepherd.id)));
    const targets = async () => (await db.link.toArray()).map((l) => [l.targetType, l.targetId]);
    expect(await targets()).toEqual([['lesson', shepherd.id]]);
    expect(await db.link.toArray()).toMatchObject([
      { fromSectionId: section.id, fromLessonId: lazarus.id },
    ]);

    const other = await sectionIn(shepherd.id, bodyWith('I am the good shepherd.'));
    await updateSection(section.id, { body: bodyWith('Now ', to('section', other.id)) }, db);
    expect(await targets()).toEqual([['section', other.id]]);

    await removeSection(section.id, {}, db);
    expect(await targets()).toEqual([]);
  });
});

describe('linkTarget', () => {
  it('shows the current title, the section’s first words, or that it was deleted', async () => {
    const lesson = await lessonOn('The Good Shepherd', '2026-10-12');
    const section = await sectionIn(
      lesson.id,
      bodyWith('I am the good shepherd. The good shepherd lays down his life.'),
    );
    expect(await linkTarget(to('lesson', lesson.id), db)).toMatchObject({
      state: 'live',
      title: 'The Good Shepherd',
    });
    await updateLesson(lesson.id, { title: 'One Flock' }, db);
    expect(await linkTarget(to('section', section.id), db)).toMatchObject({
      state: 'live',
      title: 'One Flock › “I am the good shepherd. The good…”',
    });
    expect(await linkTarget(to('lesson', '0199e0a0-0000-7000-8000-00000000dead'), db)).toEqual({
      state: 'missing',
    });
    await deleteLesson(lesson.id, db);
    expect(await linkTarget(to('lesson', lesson.id), db)).toEqual({ state: 'deleted' });
    expect(await linkTarget(to('section', section.id), db)).toEqual({ state: 'deleted' });
  });

  it('quotes a short first line whole, and an empty section as “…”', () => {
    expect(firstWords({ body: bodyWith('Short.') })).toBe('“Short.”');
    expect(firstWords({ body: { type: 'doc', content: [{ type: 'paragraph' }] } })).toBe('“…”');
  });
});

const titles = (list: Awaited<ReturnType<typeof linkedFrom>>) =>
  list.map((b) => [b.lesson.title, b.section.id]);

describe('linkedFrom', () => {
  it('lists the sections linking to a section, or to a lesson or its sections', async () => {
    const shepherd = await lessonOn('The Good Shepherd', '2026-10-12');
    const target = await sectionIn(shepherd.id, bodyWith('I am the good shepherd.'));
    const morning = await lessonOn('Morning study', '2026-10-02');
    const lazarus = await lessonOn('Lazarus', '2026-10-19');
    const fromMorning = await sectionIn(
      morning.id,
      bodyWith('Same idea as ', to('lesson', shepherd.id)),
    );
    const fromLazarus = await sectionIn(
      lazarus.id,
      bodyWith('Compare ', to('section', target.id), to('lesson', shepherd.id)),
    );

    expect(titles(await linkedFrom({ kind: 'lesson', id: shepherd.id }, db))).toEqual([
      ['Lazarus', fromLazarus.id],
      ['Morning study', fromMorning.id],
    ]);
    expect(titles(await linkedFrom({ kind: 'section', id: target.id }, db))).toEqual([
      ['Lazarus', fromLazarus.id],
    ]);

    await deleteLesson(lazarus.id, db);
    expect(titles(await linkedFrom({ kind: 'section', id: target.id }, db))).toEqual([]);
  });
});

describe('linkOptions', () => {
  const notReady = { ready: () => false, text: () => Promise.reject(new Error('not ready')) };

  it('offers the five most recent lessons when nothing is typed', async () => {
    for (let day = 1; day <= 7; day++) await lessonOn(`Day ${day}`, `2026-10-0${day}`);
    const options = await linkOptions('', db, notReady);
    expect(options.lessons.map((o) => o.lesson.title)).toEqual([
      'Day 7',
      'Day 6',
      'Day 5',
      'Day 4',
      'Day 3',
    ]);
    expect(options).toMatchObject({ sections: [], searching: false });
  });

  it('matches lesson titles itself while the search index is being built', async () => {
    await lessonOn('The Good Shepherd', '2026-10-12');
    await lessonOn('Lazarus', '2026-10-19');
    const options = await linkOptions('shep', db, notReady);
    expect(options.lessons.map((o) => o.lesson.title)).toEqual(['The Good Shepherd']);
    expect(options.searching).toBe(true);
  });

  it('takes lessons and sections from the search index once it’s ready', async () => {
    const shepherd = await lessonOn('The Good Shepherd', '2026-10-12');
    const section = await sectionIn(shepherd.id, bodyWith('The same shepherd as Psalm 23'));
    const hit = (id: string, kind: TextHit['kind']) =>
      ({ id, kind, lessonId: shepherd.id, text: '', terms: [], score: 1 }) as TextHit;
    const ready = {
      ready: () => true,
      text: async () => [hit(section.id, 'section'), hit(shepherd.id, 'lesson')],
    };
    const options = await linkOptions('shepherd', db, ready);
    expect(options.lessons.map((o) => o.lesson.id)).toEqual([shepherd.id]);
    expect(options.sections).toMatchObject([{ kind: 'section', section: { id: section.id } }]);
  });
});

describe('the Markdown export', () => {
  it('writes links as references to the target lesson’s file, with its title now', async () => {
    const shepherd = await lessonOn('The Good Shepherd', '2026-10-12');
    const target = await sectionIn(shepherd.id, bodyWith('Other sheep I have.'));
    const gone = await lessonOn('Gone', '2026-10-01');
    const lazarus = await lessonOn('Lazarus', '2026-10-19');
    await sectionIn(
      lazarus.id,
      bodyWith(
        'See ',
        to('lesson', shepherd.id),
        to('section', target.id),
        to('lesson', gone.id, 'Gone, as it was'),
        to('lesson', '0199e0a0-0000-7000-8000-00000000dead', 'Not here'),
      ),
    );
    await deleteLesson(gone.id, db);

    const markdown = (await exportLesson(lazarus.id, db))!.markdown;
    expect(markdown).toContain(
      'See [The Good Shepherd](2026-10-12-the-good-shepherd.md)' +
        '[The Good Shepherd › “Other sheep I have.”](2026-10-12-the-good-shepherd.md)' +
        'Gone, as it was (deleted)Not here\n',
    );
  });
});
