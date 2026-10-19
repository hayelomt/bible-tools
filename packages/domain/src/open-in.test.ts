import { describe, expect, it } from 'vitest';
import { type OpenInTable, openInTableSchema, openInUrl, shownTargets } from './open-in.ts';

/** A made-up target that has every kind of link; the real table's golden tests are in the web app. */
const TABLE: OpenInTable = {
  version: 1,
  targets: [
    {
      key: 'logos',
      name: 'Example',
      books: { JHN: 'Jn', ROM: 'Ro' },
      versions: { KJV: ';kjv', BSB: ';kjv', NIV: ';niv', '*': '' },
      links: {
        verse: 'https://example.com/{book}{chapter}.{verse}{version}',
        range: 'https://example.com/{book}{chapter}.{verse}-{verseEnd}{version}',
        chapter: 'https://example.com/{book}{chapter}{version}',
        crossChapter:
          'https://example.com/{book}{chapter}.{verse}-{chapterEnd}.{verseEnd}{version}',
      },
    },
    {
      key: 'biblehub',
      name: 'Few links',
      versions: { BSB: 'bsb', '*': 'kjv' },
      links: {
        verse: 'https://example.org/{version}/{book}/{chapter}-{verse}.htm',
        chapter: 'https://example.org/{version}/{book}/{chapter}.htm',
      },
      versionLinks: { bsb: { verse: 'https://example.org/bsb/{book}/{chapter}.htm#{verse}' } },
    },
  ],
};
const [full, few] = TABLE.targets as [OpenInTable['targets'][0], OpenInTable['targets'][0]];

describe('openInUrl', () => {
  it.each([
    ['a verse', { book: 'JHN', chapter: 3, verseStart: 16 }, 'https://example.com/Jn3.16;kjv'],
    [
      'a range',
      { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 },
      'https://example.com/Ro8.28-30;kjv',
    ],
    ['a chapter', { book: 'ROM', chapter: 8 }, 'https://example.com/Ro8;kjv'],
    [
      'a chapter range, as its first',
      { book: 'ROM', chapter: 7, chapterEnd: 8 },
      'https://example.com/Ro7;kjv',
    ],
    [
      'a range across chapters',
      { book: 'ROM', chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 },
      'https://example.com/Ro7.24-8.2;kjv',
    ],
    [
      'a book the table leaves out, by its USFM id',
      { book: 'PSA', chapter: 23 },
      'https://example.com/PSA23;kjv',
    ],
  ] as const)('builds %s', (_, passage, url) => {
    expect(openInUrl(full, passage, 'KJV')).toBe(url);
  });

  it("reads an editor's chip, whose unset fields are null", () => {
    const chip = { book: 'ROM', chapter: 8, verseStart: 28, chapterEnd: null, verseEnd: 30 };
    expect(
      openInUrl(full, { ...chip, translation: null, versionLabel: null } as never, 'BSB'),
    ).toBe('https://example.com/Ro8.28-30;kjv');
  });

  it('opens a range at its first verse when the target has no range links', () => {
    const range = {
      book: 'ROM',
      chapter: 8,
      verseStart: 28,
      verseEnd: 30,
    } as const;
    expect(openInUrl(few, range, 'KJV')).toBe('https://example.org/kjv/ROM/8-28.htm');
    expect(
      openInUrl(few, { ...range, chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 }, 'KJV'),
    ).toBe('https://example.org/kjv/ROM/7-24.htm');
  });

  it('uses the links for the version where they differ', () => {
    expect(openInUrl(few, { book: 'JHN', chapter: 3, verseStart: 16 }, 'BSB')).toBe(
      'https://example.org/bsb/JHN/3.htm#16',
    );
    // Only the links it changes: the chapter link is the target's own.
    expect(openInUrl(few, { book: 'JHN', chapter: 3 }, 'BSB')).toBe(
      'https://example.org/bsb/JHN/3.htm',
    );
  });

  it("opens a chip from outside in its labelled version, else the target's default", () => {
    const john = { book: 'JHN', chapter: 3, verseStart: 16 } as const;
    expect(openInUrl(full, { ...john, translation: 'shared', versionLabel: 'NIV' }, 'BSB')).toBe(
      'https://example.com/Jn3.16;niv',
    );
    expect(openInUrl(full, { ...john, translation: 'pasted', versionLabel: 'MSG' }, 'BSB')).toBe(
      'https://example.com/Jn3.16',
    );
    expect(openInUrl(full, { ...john, translation: 'shared' }, 'BSB')).toBe(
      'https://example.com/Jn3.16',
    );
  });
});

describe('shownTargets', () => {
  it("lists the user's targets in their order, skipping any the table lacks", () => {
    expect(shownTargets(TABLE, ['biblehub', 'youversion', 'logos']).map((t) => t.name)).toEqual([
      'Few links',
      'Example',
    ]);
  });
});

describe('openInTableSchema', () => {
  it('accepts the example table', () => {
    expect(openInTableSchema.parse(TABLE)).toEqual(TABLE);
  });

  it.each([
    ['another format', { ...TABLE, version: 2 }],
    [
      'an address that isn’t https',
      { ...TABLE, targets: [{ ...full, links: { ...full.links, verse: 'javascript:alert(1)' } }] },
    ],
    ['no default version', { ...TABLE, targets: [{ ...full, versions: { KJV: 'kjv' } }] }],
    ['an unknown target', { ...TABLE, targets: [{ ...full, key: 'biblegateway' }] }],
  ])('rejects %s', (_, table) => {
    expect(openInTableSchema.safeParse(table).success).toBe(false);
  });
});
