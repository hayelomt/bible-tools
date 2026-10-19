import type { BookText } from '@lamp/bible-data';
import type { BookCode, VerseRef } from '@lamp/domain';
import { beforeEach, expect, it, vi } from 'vitest';
import { chapterVerses, loadGlossary, passagesVerses } from './page-verses.ts';

let books: Partial<Record<BookCode, BookText>> = {};
vi.mock('@/data/bible.ts', () => ({
  whenBook: (_: string, code: BookCode) => Promise.resolve(books[code] ?? null),
}));

beforeEach(() => {
  books = { '2TH': { c: [[], ['a', 'b', 'c', 'd', 'e', 'f', 'he who now letteth will let']] } };
});

const ref = (fields: Partial<VerseRef>): VerseRef => ({
  book: '2TH',
  chapter: 2,
  display: '',
  ...fields,
});

it('gives a chapter its verses, numbered', async () => {
  const verses = await chapterVerses('2TH', 2);
  expect(verses.at(-1)).toEqual({
    book: '2TH',
    chapter: 2,
    verse: 7,
    text: 'he who now letteth will let',
  });
  expect(await chapterVerses('GEN', 1)).toEqual([]);
});

it('gives the passages’ KJV verses once each, in order, skipping text from outside', async () => {
  const verses = await passagesVerses([
    ref({ verseStart: 6, verseEnd: 7 }),
    ref({ verseStart: 1, translation: 'shared', snapshotText: 'a' }),
    ref({ verseStart: 7 }),
  ]);
  expect(verses.map((v) => v.verse)).toEqual([6, 7]);
});

it('gives none for a passage whose book is not here', async () => {
  expect(await passagesVerses([ref({ book: 'ROM', chapter: 1, verseStart: 13 })])).toEqual([]);
});

it('loads the glossary once', async () => {
  expect(loadGlossary()).toBe(loadGlossary());
  expect((await loadGlossary()).search('hinder').map((e) => e.term)).toEqual(['let']);
});
