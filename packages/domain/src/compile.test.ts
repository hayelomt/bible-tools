import { describe, expect, it } from 'vitest';
import { compile, type CompileSource, compileScopes, isWholeBook } from './compile.ts';
import { formatPassage, type Passage, type VerseRef } from './verse-ref.ts';

const chip = (p: Passage): VerseRef => ({ ...p, display: formatPassage(p), translation: 'BSB' });
const rom = (chapter: number, verseStart?: number, verseEnd?: number): Passage => ({
  book: 'ROM',
  chapter,
  ...(verseStart !== undefined ? { verseStart } : {}),
  ...(verseEnd !== undefined ? { verseEnd } : {}),
});
const note = (item: string, date: string, ...refs: Passage[]): CompileSource<string> => ({
  item,
  date,
  refs: refs.map(chip),
});

/** Each group as its display, then its notes. */
const shape = (groups: ReturnType<typeof compile<string>>) =>
  groups.map((g) => [formatPassage(g.passage), g.entries.map((e) => e.item)]);

const ROM_8 = rom(8);
const ROM_BOOK = compileScopes(ROM_8).book;

describe('compile', () => {
  it('orders groups by their first verse, then their last', () => {
    const groups = compile(ROM_8, [
      note('a', '2026-01-01', rom(8, 28)),
      note('b', '2026-01-01', rom(8, 1)),
      note('c', '2026-01-01', rom(8, 28, 30)),
      note('d', '2026-01-01', rom(8)),
    ]);
    expect(shape(groups)).toEqual([
      ['Romans 8', ['d']],
      ['Romans 8:1', ['b']],
      ['Romans 8:28', ['a']],
      ['Romans 8:28–30', ['c']],
    ]);
  });

  it('orders a group’s notes by date, oldest first, keeping the given order on a day', () => {
    const groups = compile(ROM_8, [
      note('late', '2026-10-12', rom(8, 28)),
      note('early-1', '2025-09-07', rom(8, 28)),
      note('early-2', '2025-09-07', rom(8, 28)),
    ]);
    expect(shape(groups)).toEqual([['Romans 8:28', ['early-1', 'early-2', 'late']]]);
  });

  it('groups chips by their range, whatever their translation or text', () => {
    const kjv = { ...chip(rom(8, 28)), translation: 'KJV' as const, snapshotText: 'And we know' };
    const groups = compile(ROM_8, [
      note('a', '2026-01-01', rom(8, 28)),
      { item: 'b', date: '2026-01-02', refs: [kjv] },
    ]);
    expect(shape(groups)).toEqual([['Romans 8:28', ['a', 'b']]]);
    expect(groups[0]!.passage).toEqual({ book: 'ROM', chapter: 8, verseStart: 28 });
    expect(groups[0]!.range).toEqual([45008028, 45008028]);
  });

  it('leaves out chips outside the scope, and notes with none inside it', () => {
    const groups = compile(rom(8, 28), [
      note('a', '2026-01-01', rom(8, 28), rom(8, 1), { book: 'JHN', chapter: 3, verseStart: 16 }),
      note('b', '2026-01-01', rom(8, 29)),
      note('c', '2026-01-01', rom(8, 27, 29)),
      note('d', '2026-01-01', rom(8)),
    ]);
    expect(shape(groups)).toEqual([
      ['Romans 8', ['d']],
      ['Romans 8:27–29', ['c']],
      ['Romans 8:28', ['a']],
    ]);
    expect(groups[2]!.entries[0]!.also).toEqual([]);
  });

  it('puts a note under a passage once, however often it cites it', () => {
    const groups = compile(ROM_8, [note('a', '2026-01-01', rom(8, 28), rom(8, 28))]);
    expect(shape(groups)).toEqual([['Romans 8:28', ['a']]]);
  });

  it('includes a range across chapters that overlaps the scope, by its first verse', () => {
    const across: Passage = { book: 'ROM', chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 };
    const sources = [note('a', '2026-01-01', rom(8, 1)), note('b', '2026-01-01', across)];
    expect(shape(compile(ROM_8, sources))).toEqual([
      ['Romans 7:24–8:2', ['b']],
      ['Romans 8:1', ['a']],
    ]);
    expect(shape(compile(rom(7), sources))).toEqual([['Romans 7:24–8:2', ['b']]]);
    expect(shape(compile(rom(8, 3), sources))).toEqual([]);
  });

  it('puts a note citing two chapters under each, saying where else it is', () => {
    const sources = [
      note('both', '2026-01-01', rom(9, 1), rom(8, 38)),
      note('other', '2025-01-01', rom(9, 1)),
    ];
    const groups = compile(ROM_BOOK, sources);
    expect(shape(groups)).toEqual([
      ['Romans 8:38', ['both']],
      ['Romans 9:1', ['other', 'both']],
    ]);
    expect(groups[0]!.entries[0]).toEqual({ item: 'both', also: [rom(9, 1)], shownUnder: null });
    expect(groups[1]!.entries[1]).toEqual({ item: 'both', also: [rom(8, 38)], shownUnder: null });

    // A chapter's view has only its own.
    const chapter = compile(ROM_8, sources);
    expect(shape(chapter)).toEqual([['Romans 8:38', ['both']]]);
    expect(chapter[0]!.entries[0]!.also).toEqual([]);
  });

  it('shows a note citing several passages once, with a pointer under the others', () => {
    const groups = compile(
      ROM_8,
      [note('a', '2026-01-01', rom(8, 38), rom(8, 28), rom(8, 31, 39))],
      'once',
    );
    expect(groups.map((g) => g.entries[0])).toEqual([
      { item: 'a', also: [rom(8, 31, 39), rom(8, 38)], shownUnder: null },
      { item: 'a', also: [rom(8, 28), rom(8, 38)], shownUnder: rom(8, 28) },
      { item: 'a', also: [rom(8, 28), rom(8, 31, 39)], shownUnder: rom(8, 28) },
    ]);
  });

  it('drops the null fields a chip node holds for a missing one', () => {
    const node = { ...chip(rom(8, 28)), chapterEnd: null, verseEnd: null } as unknown as VerseRef;
    const groups = compile(ROM_8, [{ item: 'a', date: '2026-01-01', refs: [node] }]);
    expect(groups[0]!.passage).toEqual(rom(8, 28));
  });
});

describe('compileScopes', () => {
  it('offers the passage, its chapter and its book', () => {
    expect(compileScopes({ ...chip(rom(8, 28)) })).toEqual({
      passage: rom(8, 28),
      chapter: rom(8),
      book: { book: 'ROM', chapter: 1, chapterEnd: 16 },
    });
  });

  it('keeps every chapter a range crosses', () => {
    const across: Passage = { book: 'ROM', chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 };
    expect(compileScopes(across).chapter).toEqual({ book: 'ROM', chapter: 7, chapterEnd: 8 });
  });

  it('makes a one-chapter book its only chapter', () => {
    const scopes = compileScopes({ book: 'JUD', chapter: 1, verseStart: 3 });
    expect(scopes.book).toEqual({ book: 'JUD', chapter: 1 });
    expect(isWholeBook(scopes.book)).toBe(true);
  });

  it('tells a whole book from a chapter', () => {
    expect(isWholeBook(ROM_BOOK)).toBe(true);
    expect(isWholeBook(ROM_8)).toBe(false);
    expect(isWholeBook({ book: 'ROM', chapter: 1, chapterEnd: 15 })).toBe(false);
    expect(isWholeBook({ book: 'ROM', chapter: 1 })).toBe(false);
  });
});
