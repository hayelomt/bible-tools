import {
  OPEN_IN_TRANSLATIONS,
  type OpenInTarget,
  openInTableSchema,
  openInUrl,
  type VerseRef,
} from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import bundled from '../../public/open-in.json' with { type: 'json' };

// Golden tests for the target table (M9-10): each target's address for a verse, a range, a chapter
// and a range across chapters, as fetched for TECH-DESIGN §17.11.

const table = openInTableSchema.parse(bundled);
const target = (key: OpenInTarget) => table.targets.find((t) => t.key === key)!;

type Chip = Omit<VerseRef, 'display'>;
const VERSE: Chip = { book: 'JHN', chapter: 3, verseStart: 16 };
const RANGE: Chip = { book: 'ROM', chapter: 8, verseStart: 28, verseEnd: 30 };
const CHAPTER: Chip = { book: 'PSA', chapter: 23 };
const ACROSS: Chip = { book: 'ROM', chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 };

describe('the "Open in…" table', () => {
  it.each([
    ['blueletterbible', VERSE, 'KJV', 'https://www.blueletterbible.org/kjv/jhn/3/16/'],
    ['blueletterbible', RANGE, 'KJV', 'https://www.blueletterbible.org/kjv/rom/8/28-30/'],
    ['blueletterbible', CHAPTER, 'KJV', 'https://www.blueletterbible.org/kjv/psa/23/'],
    ['blueletterbible', ACROSS, 'KJV', 'https://www.blueletterbible.org/kjv/rom/7/24/'],
    // No BSB there: the KJV.
    ['blueletterbible', VERSE, 'BSB', 'https://www.blueletterbible.org/kjv/jhn/3/16/'],
    ['youversion', VERSE, 'KJV', 'https://www.bible.com/bible/1/JHN.3.16'],
    ['youversion', RANGE, 'BSB', 'https://www.bible.com/bible/3034/ROM.8.28-30'],
    ['youversion', CHAPTER, 'BSB', 'https://www.bible.com/bible/3034/PSA.23'],
    ['youversion', ACROSS, 'KJV', 'https://www.bible.com/bible/1/ROM.7.24'],
    ['biblehub', VERSE, 'KJV', 'https://biblehub.com/kjv/john/3-16.htm'],
    ['biblehub', VERSE, 'BSB', 'https://biblehub.com/bsb/john/3.htm#16'],
    ['biblehub', RANGE, 'KJV', 'https://biblehub.com/kjv/romans/8-28.htm'],
    ['biblehub', CHAPTER, 'BSB', 'https://biblehub.com/bsb/psalms/23.htm'],
    ['biblehub', ACROSS, 'KJV', 'https://biblehub.com/kjv/romans/7-24.htm'],
    ['logos', VERSE, 'KJV', 'https://ref.ly/Jn3.16;kjv'],
    ['logos', RANGE, 'KJV', 'https://ref.ly/Ro8.28-30;kjv'],
    ['logos', CHAPTER, 'KJV', 'https://ref.ly/Ps23;kjv'],
    ['logos', ACROSS, 'KJV', 'https://ref.ly/Ro7.24-8.2;kjv'],
    // BSB on Logos needs a sign-in: the KJV.
    ['logos', VERSE, 'BSB', 'https://ref.ly/Jn3.16;kjv'],
    // A commentary by chapter, in no translation.
    ['enduringword', VERSE, 'BSB', 'https://enduringword.com/bible-commentary/john-3/'],
    ['enduringword', RANGE, 'KJV', 'https://enduringword.com/bible-commentary/romans-8/'],
    ['enduringword', CHAPTER, 'BSB', 'https://enduringword.com/bible-commentary/psalm-23/'],
    ['enduringword', ACROSS, 'BSB', 'https://enduringword.com/bible-commentary/romans-7/'],
    [
      'enduringword',
      { book: 'SNG', chapter: 2 },
      'BSB',
      'https://enduringword.com/bible-commentary/song-of-solomon-2/',
    ],
    // A book of one chapter is chapter 1.
    [
      'enduringword',
      { book: '3JN', chapter: 1, verseStart: 4 },
      'BSB',
      'https://enduringword.com/bible-commentary/3-john-1/',
    ],
  ] as const)('%s: %o in the %s', (key, chip, translation, url) => {
    expect(openInUrl(target(key), chip, translation)).toBe(url);
  });

  it('opens a chip from outside in its version where the target has it, else its default', () => {
    const niv: Chip = { ...VERSE, translation: 'shared', versionLabel: 'NIV' };
    expect(openInUrl(target('youversion'), niv, 'BSB')).toBe(
      'https://www.bible.com/bible/111/JHN.3.16',
    );
    expect(openInUrl(target('biblehub'), niv, 'BSB')).toBe(
      'https://biblehub.com/niv/john/3-16.htm',
    );
    const pasted: Chip = { ...VERSE, translation: 'pasted' };
    expect(openInUrl(target('biblehub'), pasted, 'BSB')).toBe('https://biblehub.com/john/3-16.htm');
    expect(openInUrl(target('logos'), pasted, 'BSB')).toBe('https://ref.ly/Jn3.16');
  });

  it('has every translation Settings offers in each Bible target', () => {
    for (const key of ['blueletterbible', 'youversion', 'biblehub', 'logos'] as const) {
      for (const translation of OPEN_IN_TRANSLATIONS) {
        expect(target(key).versions[translation], `${translation} in ${key}`).toBeDefined();
      }
    }
  });

  it('names a book code for every book in each target that has its own', () => {
    const counts = table.targets.flatMap(({ key, books }) =>
      books ? [[key, Object.keys(books).length]] : [],
    );
    expect(counts).toEqual([
      ['blueletterbible', 66],
      ['biblehub', 66],
      ['logos', 66],
      ['enduringword', 66],
    ]);
  });
});
