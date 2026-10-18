import type { VerseTextMatch } from '@lamp/bible-data';
import type { BookCode } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { readPaste } from './read-paste.ts';

const GOOD_SHEPHERD = 'I am the good shepherd. The good shepherd lays down His life for the sheep.';

/** The matcher's answer for `verse` found in `text`, as `VerseTextIndex.match` gives it. */
function matched(
  text: string,
  verse: string,
  passage: { book: BookCode; chapter: number; verseStart: number; verseEnd?: number },
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
    passage: { ...passage, display },
    edits: 0,
  };
}

const JOHN_10_11 = { book: 'JHN', chapter: 10, verseStart: 11 } as const;
/** Each chip as "John 10:11 · BSB", with what it replaces. */
const shown = (text: string, chips: ReturnType<typeof readPaste>) =>
  chips.map((c) => [
    `${c.ref.display} · ${c.ref.versionLabel ?? c.ref.translation}`,
    text.slice(c.from, c.to),
  ]);

describe('readPaste', () => {
  it('puts a reference and the verse after it in one chip, with the text as pasted', () => {
    const text = `Jesus says in John 10:11 ${GOOD_SHEPHERD} So He knows us.`;
    const chips = readPaste(text, [matched(text, GOOD_SHEPHERD, JOHN_10_11, 'John 10:11')], 'KJV');
    expect(shown(text, chips)).toEqual([['John 10:11 · BSB', `John 10:11 ${GOOD_SHEPHERD}`]]);
    expect(chips[0]).toMatchObject({
      fromBook: false,
      matchedOnly: false,
      ref: { snapshotText: GOOD_SHEPHERD },
    });
  });

  it('takes a YouVersion copy whole: the quoted verse and the reference after it', () => {
    const text = `“${GOOD_SHEPHERD}”\nJohn 10:11 BSB`;
    const chips = readPaste(text, [matched(text, GOOD_SHEPHERD, JOHN_10_11, 'John 10:11')], 'KJV');
    expect(shown(text, chips)).toEqual([['John 10:11 · BSB', text]]);
  });

  it('finds a verse from its words alone', () => {
    const text = `Remember this: ${GOOD_SHEPHERD}`;
    const chips = readPaste(text, [matched(text, GOOD_SHEPHERD, JOHN_10_11, 'John 10:11')], 'BSB');
    expect(chips).toMatchObject([
      { matchedOnly: true, ref: { display: 'John 10:11', translation: 'BSB' } },
    ]);
  });

  it('keeps a reference for another passage apart from the verse', () => {
    const text = `Psalm 23:1 and ${GOOD_SHEPHERD}`;
    const chips = readPaste(text, [matched(text, GOOD_SHEPHERD, JOHN_10_11, 'John 10:11')], 'BSB');
    expect(shown(text, chips)).toEqual([
      ['Psalm 23:1 · BSB', 'Psalm 23:1'],
      ['John 10:11 · BSB', GOOD_SHEPHERD],
    ]);
    expect(chips[0]!.fromBook).toBe(true);
  });

  it('makes a bare reference a chip from the book in the default translation; the text stays', () => {
    const text = 'Paul says Romans 8:28 is about hope.';
    const chips = readPaste(text, [], 'KJV');
    expect(shown(text, chips)).toEqual([['Romans 8:28 · KJV', 'Romans 8:28']]);
    expect(chips[0]).toMatchObject({ fromBook: true, ref: { translation: 'KJV' } });
    expect(chips[0]!.ref).not.toHaveProperty('snapshotText');
  });

  it('keeps text after another version as pasted, labelled', () => {
    const niv = 'For God so loved the world that he gave his one and only Son';
    const text = `John 3:16 (NIV) ${niv}\nWhat a promise.`;
    const chips = readPaste(text, [], 'BSB');
    expect(shown(text, chips)).toEqual([['John 3:16 · NIV', `John 3:16 (NIV) ${niv}`]]);
    expect(chips[0]!.ref).toMatchObject({
      translation: 'pasted',
      versionLabel: 'NIV',
      snapshotText: niv,
    });
  });

  it('reads the line before a labelled reference on its own line, as YouVersion copies it', () => {
    const esv = 'For God so loved the world, that he gave his only Son';
    const text = `My verse:\n“${esv}”\nJohn 3:16 ESV`;
    const chips = readPaste(text, [], 'BSB');
    expect(shown(text, chips)).toEqual([['John 3:16 · ESV', `“${esv}”\nJohn 3:16 ESV`]]);
    expect(chips[0]!.ref.snapshotText).toBe(esv);
  });

  it('gives a labelled reference without text no snapshot', () => {
    const chips = readPaste('John 3:16 NIV', [], 'BSB');
    expect(chips[0]!.ref).toMatchObject({ translation: 'pasted', versionLabel: 'NIV' });
    expect(chips[0]!.ref).not.toHaveProperty('snapshotText');
  });

  it('takes BSB or KJV after a reference as the book to fill it from', () => {
    const text = 'Romans 8:28 KJV is my favourite';
    expect(readPaste(text, [], 'BSB')).toMatchObject([
      { from: 0, to: 15, fromBook: true, ref: { translation: 'KJV', display: 'Romans 8:28' } },
    ]);
  });

  it('lists several references in order', () => {
    const text = 'Sermon notes: Romans 8:28, 38–39; Psalm 23:1';
    expect(shown(text, readPaste(text, [], 'BSB'))).toEqual([
      ['Romans 8:28 · BSB', 'Romans 8:28'],
      ['Romans 8:38–39 · BSB', '38–39'],
      ['Psalm 23:1 · BSB', 'Psalm 23:1'],
    ]);
  });

  it('finds nothing in plain text', () => {
    expect(readPaste('Look up "hesed" before Sunday.', [], 'BSB')).toEqual([]);
  });
});
