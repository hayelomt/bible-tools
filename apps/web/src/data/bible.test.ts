import type { BookText } from '@lamp/bible-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookState, numberedVerses, quoteText, whenBook } from './bible.ts';

// Acts 8 in miniature: verse 3 is one the BSB leaves out.
const BOOK: BookText = {
  c: [[], [], [], [], [], [], [], ['One.', 'Two.', '', 'Four.']],
  n: { '8:3': 'Some later manuscripts include this verse.' },
};

describe('quoteText', () => {
  it('joins the verses of the passage', () => {
    expect(quoteText(BOOK, { book: 'ACT', chapter: 8, verseStart: 1, verseEnd: 2 }, 'BSB')).toBe(
      'One. Two.',
    );
  });

  it('skips a verse left out in a range', () => {
    expect(quoteText(BOOK, { book: 'ACT', chapter: 8, verseStart: 2, verseEnd: 4 }, 'BSB')).toBe(
      'Two. Four.',
    );
  });

  it('gives the note, marked, for a verse left out on its own', () => {
    expect(quoteText(BOOK, { book: 'ACT', chapter: 8, verseStart: 3 }, 'BSB')).toBe(
      '[Not in BSB: Some later manuscripts include this verse.]',
    );
  });
});

describe('numberedVerses', () => {
  const ACTS_8_9: BookText = { ...BOOK, c: [...BOOK.c, ['Nine one.', 'Nine two.']] };

  it('numbers the verses of the snapshot, skipping one left out', () => {
    const passage = { book: 'ACT', chapter: 8, verseStart: 2, verseEnd: 4 } as const;
    expect(numberedVerses(BOOK, passage, 'Two. Four.')).toEqual([
      { label: '2', text: 'Two.' },
      { label: '4', text: 'Four.' },
    ]);
  });

  it('gives the chapter where a new one starts', () => {
    const passage = { book: 'ACT', chapter: 8, verseStart: 4, chapterEnd: 9, verseEnd: 1 } as const;
    expect(numberedVerses(ACTS_8_9, passage, 'Four. Nine one.')).toEqual([
      { label: '4', text: 'Four.' },
      { label: '9:1', text: 'Nine one.' },
    ]);
  });

  it('gives null when the snapshot isn’t the book’s text', () => {
    const passage = { book: 'ACT', chapter: 8, verseStart: 1, verseEnd: 2 } as const;
    expect(numberedVerses(BOOK, passage, 'One. Two, as first published.')).toBeNull();
    const leftOut = { book: 'ACT', chapter: 8, verseStart: 3 } as const;
    expect(
      numberedVerses(BOOK, leftOut, '[Not in BSB: Some later manuscripts include this verse.]'),
    ).toBeNull();
  });
});

describe('whenBook', () => {
  afterEach(() => vi.unstubAllGlobals());

  // The manifest is read once per page, so every test here shares one.
  const KJV_3JN: BookText = { c: [['The elder unto the wellbeloved Gaius.']] };
  const files: Record<string, unknown> = {
    '/bible/manifest.json': {
      translations: {
        BSB: { books: { ACT: { file: 'BSB/ACT.1.json' }, '3JN': { file: 'BSB/3JN.1.json' } } },
        KJV: { books: { '3JN': { file: 'KJV/3JN.1.json' } } },
      },
    },
    '/bible/BSB/ACT.1.json': BOOK,
    '/bible/BSB/3JN.1.json': BOOK,
    '/bible/KJV/3JN.1.json': KJV_3JN,
  };

  it('waits for the book, then gives it at once', async () => {
    const fetch = vi.fn<(url: string) => Promise<Response>>((url) =>
      Promise.resolve(Response.json(files[url])),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await whenBook('BSB', 'ACT')).toEqual(BOOK);
    expect(bookState('BSB', 'ACT')).toEqual({ status: 'ready', text: BOOK });
    expect(await whenBook('BSB', 'ACT')).toEqual(BOOK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps each translation’s book apart', async () => {
    vi.stubGlobal('fetch', (url: string) => Promise.resolve(Response.json(files[url])));
    expect(await whenBook('KJV', '3JN')).toEqual(KJV_3JN);
    expect(await whenBook('BSB', '3JN')).toEqual(BOOK);
  });

  it('gives null when the book can’t be fetched', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    expect(await whenBook('BSB', 'JUD')).toBeNull();
  });
});
