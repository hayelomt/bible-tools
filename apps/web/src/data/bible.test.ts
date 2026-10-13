import type { BookText } from '@lamp/bible-data';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bookState, snapshotText, whenBook } from './bible.ts';

// Acts 8 in miniature: verse 3 is one WEB leaves out.
const BOOK: BookText = {
  c: [[], [], [], [], [], [], [], ['One.', 'Two.', '', 'Four.']],
  n: { '8:3': 'TR adds a verse.' },
};

describe('snapshotText', () => {
  it('joins the verses of the passage', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 1, verseEnd: 2 })).toBe(
      'One. Two.',
    );
  });

  it('skips a verse left out in a range', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 2, verseEnd: 4 })).toBe(
      'Two. Four.',
    );
  });

  it('gives the footnote, marked, for a verse left out on its own', () => {
    expect(snapshotText(BOOK, { book: 'ACT', chapter: 8, verseStart: 3 })).toBe(
      '[Not in WEB: TR adds a verse.]',
    );
  });
});

describe('whenBook', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('waits for the book, then gives it at once', async () => {
    const files: Record<string, unknown> = {
      '/bible/manifest.json': {
        translations: { WEB: { books: { ACT: { file: 'WEB/ACT.1.json' } } } },
      },
      '/bible/WEB/ACT.1.json': BOOK,
    };
    const fetch = vi.fn<(url: string) => Promise<Response>>((url) =>
      Promise.resolve(Response.json(files[url])),
    );
    vi.stubGlobal('fetch', fetch);
    expect(await whenBook('ACT')).toEqual(BOOK);
    expect(bookState('ACT')).toEqual({ status: 'ready', text: BOOK });
    expect(await whenBook('ACT')).toEqual(BOOK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('gives null when the book can’t be fetched', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    expect(await whenBook('JUD')).toBeNull();
  });
});
