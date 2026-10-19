import {
  BOOK_CODES,
  type BookCode,
  formatPassage,
  getBook,
  keyBetween,
  type Passage,
  type SectionBody,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tagResults, verseIndex } from '@/search/results.ts';
import { createLesson, deleteLesson } from './actions/lessons.ts';
import { createSection, removeSection } from './actions/sections.ts';
import { addTag } from './actions/tags.ts';
import { LampDb } from './db.ts';
import { ensureDevice } from './setup.ts';
import { byBook, byMonth, heatStep, lastMonths, themeData } from './theme-map.ts';

let db: LampDb;
let dbCount = 0;

beforeEach(async () => {
  db = new LampDb(`theme-map-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  await db.delete();
});

const chip = (p: Passage) => ({
  type: 'verse' as const,
  attrs: { ...p, display: formatPassage(p) },
});
const citing = (...passages: Passage[]): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'On ' }, ...passages.map(chip)] }],
});

const lessonOn = (title: string, date: string, mainPassages: Passage[] = []) =>
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
      mainPassages: mainPassages.map((p) => chip(p).attrs),
    },
    db,
  );

let order: string | null = null;
async function tagged(lessonId: string, body: SectionBody, ...tags: string[]) {
  order = keyBetween(order, null);
  const section = await createSection(
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
  for (const tag of tags) await addTag({ kind: 'section', id: section.id }, tag, db);
  return section;
}

const ROM_8 = { book: 'ROM', chapter: 8 } as const;
const JHN_10 = { book: 'JHN', chapter: 10 } as const;
const PSA_23 = { book: 'PSA', chapter: 23 } as const;

/** A year of notes: grace in March and October, hope once, a lesson tagged as a whole. */
async function fixture() {
  const march = await lessonOn('More than conquerors', '2026-03-01', [ROM_8]);
  await tagged(march.id, citing(ROM_8), 'grace');
  await tagged(march.id, citing(ROM_8, JHN_10), 'grace', 'hope');
  await tagged(march.id, citing(PSA_23));
  const later = await lessonOn('Still March', '2026-03-29');
  await tagged(later.id, citing(PSA_23), 'grace');
  const october = await lessonOn('The Good Shepherd', '2026-10-12', [JHN_10]);
  await addTag({ kind: 'lesson', id: october.id }, 'grace', db);
  await tagged(october.id, citing(JHN_10), 'grace');
  // Too long ago for the month view, but on the map by book.
  const old = await lessonOn('Psalm 23', '2024-09-01');
  await tagged(old.id, citing(PSA_23), 'grace');
  // Gone: a deleted section and a deleted lesson count nowhere.
  const gone = await tagged(october.id, citing(ROM_8), 'grace');
  await removeSection(gone.id, {}, db);
  const deleted = await lessonOn('Deleted', '2026-10-05');
  await tagged(deleted.id, citing(ROM_8), 'hope');
  await deleteLesson(deleted.id, db);
}

const tagIdOf = async (name: string) => (await db.tag.filter((t) => t.name === name).first())!.id;
const notes = (groups: Awaited<ReturnType<typeof tagResults>>) =>
  groups.reduce((n, g) => n + g.items.length, 0);

describe('lastMonths', () => {
  it('ends with this month, oldest first, across years', () => {
    const months = lastMonths('2026-10-19');
    expect(months).toHaveLength(24);
    expect(months[0]).toBe('2024-11');
    expect(months.at(-1)).toBe('2026-10');
    expect(lastMonths('2026-01-31', 3)).toEqual(['2025-11', '2025-12', '2026-01']);
  });
});

describe('heatStep', () => {
  it('follows the scale: none, 1–2, 3–5, 6–9, 10+', () => {
    expect([0, 1, 2, 3, 5, 6, 9, 10, 40].map(heatStep)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });
});

describe('tags by month (M12-03)', () => {
  it('counts what the tag page lists for each month', async () => {
    await fixture();
    const months = lastMonths('2026-10-19');
    const { tags, items } = await themeData(db);
    const rows = byMonth(tags, items, months);
    // Most used first; a tag with nothing in the period isn't shown.
    expect(rows.map((r) => [r.tag.name, r.total])).toEqual([
      ['grace', 5],
      ['hope', 1],
    ]);
    const grace = rows[0]!;
    expect(grace.cells[months.indexOf('2026-03')]).toBe(3);
    expect(grace.cells[months.indexOf('2026-10')]).toBe(2);

    for (const row of rows) {
      for (const [i, month] of months.entries()) {
        const page = await tagResults(row.tag.id, db, { month });
        expect({ tag: row.tag.name, month, count: row.cells[i] }).toEqual({
          tag: row.tag.name,
          month,
          count: notes(page),
        });
      }
    }
    // The whole tag page holds the period's notes and the older one.
    expect(notes(await tagResults(await tagIdOf('grace'), db))).toBe(grace.total + 1);
  });
});

describe('tags by book (M12-04)', () => {
  it('has every one of the 66 books, and counts match the verse index', async () => {
    await fixture();
    const { tags, items } = await themeData(db);
    const rows = byBook(tags, items);
    expect(rows.every((r) => r.cells.length === 66)).toBe(true);
    const grace = rows.find((r) => r.tag.name === 'grace')!;
    const cell = (book: BookCode) => grace.cells[BOOK_CODES.indexOf(book)];
    expect([cell('ROM'), cell('JHN'), cell('PSA'), cell('GEN')]).toEqual([2, 3, 2, 0]);
    // A note citing two books counts in each, and once in the total.
    expect(grace.total).toBe(6);

    for (const row of rows) {
      const taggedIds = new Set(items.filter((i) => i.tagId === row.tag.id).map((i) => i.id));
      for (const [i, book] of BOOK_CODES.entries()) {
        const chapters = getBook(book).verses.length;
        const whole: Passage =
          chapters > 1 ? { book, chapter: 1, chapterEnd: chapters } : { book, chapter: 1 };
        const index = (await verseIndex(whole, db)).filter(
          (entry) =>
            (entry.kind === 'lesson' || entry.kind === 'section') && taggedIds.has(entry.id),
        );
        expect({ tag: row.tag.name, book, count: row.cells[i] }).toEqual({
          tag: row.tag.name,
          book,
          count: index.length,
        });
        const page = await tagResults(row.tag.id, db, { book });
        expect(notes(page)).toBe(row.cells[i]);
      }
    }
  });
});
