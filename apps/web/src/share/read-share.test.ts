import type { VerseTextMatch } from '@lamp/bible-data';
import { describe, expect, it } from 'vitest';
import { readShare, shareHints } from './read-share.ts';

const GOOD_SHEPHERD = 'I am the good shepherd. The good shepherd lays down His life for the sheep.';

/** The matcher's answer for `verse` found in `text`, as `VerseTextIndex.match` gives it. */
function matched(
  text: string,
  verse: string,
  display: string,
  translation = 'BSB',
): VerseTextMatch {
  const from = text.indexOf(verse);
  const to = from + verse.replace(/\W+$/u, '').length;
  return {
    from,
    to,
    text: text.slice(from, to),
    translation,
    passage: { book: 'JHN', chapter: 10, verseStart: 11, display },
    edits: 0,
  };
}

describe('readShare', () => {
  it('reads a YouVersion share: the matched verse with its text, no note', () => {
    const text = `“${GOOD_SHEPHERD}”\nJohn 10:11 BSB\n\nhttps://bible.com/bible/3034/jhn.10.11.BSB`;
    const reading = readShare({ text }, [matched(text, GOOD_SHEPHERD, 'John 10:11')], 'KJV');
    expect(reading).toEqual({
      verses: [
        {
          fromBook: false,
          ref: {
            book: 'JHN',
            chapter: 10,
            verseStart: 11,
            display: 'John 10:11',
            translation: 'BSB',
            snapshotText: GOOD_SHEPHERD,
          },
        },
      ],
      note: null,
      sourceUrl: 'https://bible.com/bible/3034/jhn.10.11.BSB',
    });
  });

  it('keeps text from another version as it came, labelled with the version', () => {
    const niv = 'For God so loved the world that he gave his one and only Son…';
    const reading = readShare(
      { text: `${niv}\nJohn 3:16 NIV`, url: 'https://bible.com/bible/111/jhn.3.16.NIV' },
      [],
      'BSB',
    );
    expect(reading.verses).toEqual([
      {
        fromBook: false,
        ref: {
          book: 'JHN',
          chapter: 3,
          verseStart: 16,
          display: 'John 3:16',
          translation: 'shared',
          versionLabel: 'NIV',
          snapshotText: niv,
        },
      },
    ]);
    expect(reading.note).toBeNull();
  });

  it('labels text from an unknown source `shared`', () => {
    const reading = readShare(
      {
        text: 'Psalm 23:1 The LORD is my shepherd; I have all that I need.',
        url: 'https://biblehub.com/psalms/23-1.htm',
      },
      [],
      'BSB',
    );
    expect(reading.verses[0]!.ref).toMatchObject({
      display: 'Psalm 23:1',
      translation: 'shared',
      snapshotText: 'The LORD is my shepherd; I have all that I need.',
    });
    expect(reading.verses[0]!.ref).not.toHaveProperty('versionLabel');
  });

  it('makes a reference from elsewhere a chip from the book, and the rest a note', () => {
    const reading = readShare({ text: 'Look at John 3:16 for Sunday' }, [], 'KJV');
    expect(reading.verses).toEqual([
      {
        fromBook: true,
        ref: { book: 'JHN', chapter: 3, verseStart: 16, display: 'John 3:16', translation: 'KJV' },
      },
    ]);
    expect(reading.note).toBe('Look at for Sunday');
  });

  it('finds a verse from its text alone', () => {
    const text = `Read this today: ${GOOD_SHEPHERD} Then pray.`;
    const reading = readShare({ text }, [matched(text, GOOD_SHEPHERD, 'John 10:11')], 'BSB');
    expect(reading.verses).toMatchObject([
      { ref: { display: 'John 10:11', translation: 'BSB', snapshotText: GOOD_SHEPHERD } },
    ]);
    expect(reading.note).toBe('Read this today:  Then pray.'.replace(':  ', ': '));
  });

  it('makes each reference an item, with the rest a note on the first', () => {
    const reading = readShare(
      {
        text: 'Sermon notes: Romans 8:28, 38–39; Psalm 23:1 (ESV) — the shepherd who never leaves.',
      },
      [],
      'BSB',
    );
    expect(
      reading.verses.map((v) => [v.ref.display, v.ref.translation, v.ref.versionLabel]),
    ).toEqual([
      ['Romans 8:28', 'shared', 'ESV'],
      ['Romans 8:38–39', 'shared', 'ESV'],
      ['Psalm 23:1', 'shared', 'ESV'],
    ]);
    expect(reading.verses.every((v) => !v.ref.snapshotText)).toBe(true);
    expect(reading.note).toBe('Sermon notes: the shepherd who never leaves.');
  });

  it('takes the passage from the address when the text names none', () => {
    const reading = readShare(
      { text: 'A verse for today', url: 'https://www.bible.com/bible/3034/JHN.10.11.BSB' },
      [],
      'KJV',
    );
    expect(reading.verses).toMatchObject([
      { ref: { display: 'John 10:11', translation: 'BSB', snapshotText: 'A verse for today' } },
    ]);
  });

  it('reads the title when the text has no reference', () => {
    const reading = readShare({ title: 'John 10:11', text: 'Lovely sermon on this' }, [], 'BSB');
    expect(reading.verses.map((v) => v.ref.display)).toEqual(['John 10:11']);
    expect(reading.note).toBe('Lovely sermon on this');
  });

  it('keeps a share without a verse as a note', () => {
    expect(readShare({ text: 'Look up "hesed" before Sunday.' }, [], 'BSB')).toEqual({
      verses: [],
      note: 'Look up "hesed" before Sunday.',
      sourceUrl: null,
    });
    expect(readShare({ url: 'https://example.com/post' }, [], 'BSB')).toEqual({
      verses: [],
      note: 'https://example.com/post',
      sourceUrl: 'https://example.com/post',
    });
  });

  it('drops verse numbers and loose spacing from the shared text', () => {
    const text = '1 The LORD is my shepherd; I shall not want.\n\n2 He maketh me to lie down';
    const reading = readShare({ text: `Psalm 23:1-2 KJV ${text}` }, [], 'BSB');
    expect(reading.verses[0]!.ref.snapshotText).toBe(
      'The LORD is my shepherd; I shall not want.\nHe maketh me to lie down',
    );
  });
});

describe('shareHints', () => {
  it('lists the references in the text and the address', () => {
    expect(
      shareHints({ text: 'Proverbs 16:25', url: 'https://bible.com/bible/3034/PRO.14.12.BSB' }).map(
        (p) => `${p.book} ${p.chapter}:${p.verseStart}`,
      ),
    ).toEqual(['PRO 16:25', 'PRO 14:12']);
  });
});
