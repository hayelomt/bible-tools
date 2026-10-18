import { describe, expect, it } from 'vitest';
import { isBibleSite, type ShareSource, shareSource } from './share-source.ts';

const shared: ShareSource = { translation: 'shared' };
const label = (versionLabel: string): ShareSource => ({ translation: 'shared', versionLabel });

describe('shareSource from an address', () => {
  it.each<[string, ShareSource]>([
    // YouVersion: the id, else the abbreviation at the end; the passage from the USFM id.
    [
      'https://www.bible.com/bible/3034/JHN.10.11.BSB',
      {
        translation: 'BSB',
        passage: { book: 'JHN', chapter: 10, verseStart: 11, display: 'John 10:11' },
      },
    ],
    [
      'https://bible.com/bible/1/jhn.3.16.KJV',
      {
        translation: 'KJV',
        passage: { book: 'JHN', chapter: 3, verseStart: 16, display: 'John 3:16' },
      },
    ],
    [
      'https://bible.com/bible/111/rom.8.28-30.NIV',
      {
        ...label('NIV'),
        passage: {
          book: 'ROM',
          chapter: 8,
          verseStart: 28,
          verseEnd: 30,
          display: 'Romans 8:28–30',
        },
      },
    ],
    [
      'https://www.bible.com/bible/59/PSA.23',
      { ...label('ESV'), passage: { book: 'PSA', chapter: 23, display: 'Psalm 23' } },
    ],
    [
      'https://www.bible.com/en-GB/bible/113/JHN.3.16.NIVUK',
      {
        ...label('NIVUK'),
        passage: { book: 'JHN', chapter: 3, verseStart: 16, display: 'John 3:16' },
      },
    ],
    // An id Lamp doesn't know and no abbreviation: shared, with the passage.
    [
      'https://www.bible.com/bible/9999/JHN.3.16',
      {
        translation: 'shared',
        passage: { book: 'JHN', chapter: 3, verseStart: 16, display: 'John 3:16' },
      },
    ],
    [
      'https://www.bible.com/bible/3034/JHN.10',
      {
        translation: 'BSB',
        passage: { book: 'JHN', chapter: 10, display: 'John 10' },
      },
    ],
    // A passage that doesn't exist is left out; the version still counts.
    ['https://www.bible.com/bible/3034/JHN.30.1.BSB', { translation: 'BSB' }],
    ['https://www.bible.com/bible/111/XYZ.3.16.NIV', label('NIV')],
    ['https://www.bible.com/reading-plans/123-some-plan', shared],
    ['https://www.bible.com/', shared],

    // Blue Letter Bible: `t=`, or the first path segment.
    ['https://www.blueletterbible.org/kjv/jhn/3/16/', { translation: 'KJV' }],
    ['https://www.blueletterbible.org/niv/rom/8/28/', label('NIV')],
    ['https://www.blueletterbible.org/esv/psa/23/1/s_501001', label('ESV')],
    ['https://www.blueletterbible.org/Bible.cfm?b=Jhn&c=3&v=16&t=KJV', { translation: 'KJV' }],
    ['https://www.blueletterbible.org/Bible.cfm?b=Rom&c=8&t=nasb95', label('NASB95')],
    ['https://www.blueletterbible.org/lexicon/g26/kjv/tr/0-1/', shared],
    ['https://www.blueletterbible.org/nasb20/jhn/3/16/', label('NASB20')],
    ['https://www.blueletterbible.org/', shared],

    // Bible Hub: the first path segment when it's a version.
    ['https://biblehub.com/bsb/john/3.htm', { translation: 'BSB' }],
    ['https://biblehub.com/kjv/john/3-16.htm', { translation: 'KJV' }],
    ['https://biblehub.com/niv/romans/8-28.htm', label('NIV')],
    ['https://biblehub.com/esv/psalms/23.htm', label('ESV')],
    ['https://biblehub.com/nkjv/john/10-11.htm', label('NKJV')],
    ['https://biblehub.com/john/3-16.htm', shared],
    ['https://biblehub.com/interlinear/john/3-16.htm', shared],
    ['https://biblehub.com/commentaries/john/3-16.htm', shared],

    // Anything else is shared.
    ['https://www.biblegateway.com/passage/?search=John+3%3A16&version=NIV', shared],
    ['https://example.com/kjv/john/3/16', shared],
    ['not an address', shared],
    ['', shared],
  ])('%s', (url, expected) => {
    expect(shareSource(url)).toEqual(expected);
  });
});

describe('shareSource from text', () => {
  it.each<[string, ShareSource]>([
    ['I am the good shepherd. John 10:11 BSB', { translation: 'BSB' }],
    ['“For God so loved the world…” John 3:16 KJV', { translation: 'KJV' }],
    ['John 3:16 NIV\nhttps://example.com/x', label('NIV')],
    ['And we know… Romans 8:28 (ESV)', label('ESV')],
    ['Romans 8:28 [NLT]', label('NLT')],
    ['Psalm 23:1 is a favourite', shared],
    // Only capitals count, and only versions Lamp knows.
    ['Romans 8:28 net gain', shared],
    ['John 3:16 WOW', shared],
    ['NIV without a reference', shared],
    ['', shared],
  ])('%s', (text, expected) => {
    expect(shareSource(null, text)).toEqual(expected);
  });

  it('prefers the address, and reads the text when the address names no version', () => {
    expect(shareSource('https://bible.com/bible/111/jhn.3.16.NIV', 'John 3:16 KJV')).toMatchObject(
      label('NIV'),
    );
    expect(shareSource('https://www.bible.com/bible/9999/JHN.3.16', 'John 3:16 ESV')).toMatchObject(
      label('ESV'),
    );
    expect(shareSource('https://example.com/post', 'John 3:16 ESV')).toEqual(label('ESV'));
  });
});

describe('isBibleSite', () => {
  it.each([
    ['https://www.bible.com/bible/111/JHN.3.16.NIV', true],
    ['https://my.bible.com/bible/1/JHN.3.16', true],
    ['https://biblehub.com/john/3-16.htm', true],
    ['https://www.blueletterbible.org/', true],
    ['https://example.com/bible.com', false],
    ['not an address', false],
    [null, false],
  ])('%s', (url, expected) => {
    expect(isBibleSite(url)).toBe(expected);
  });
});
