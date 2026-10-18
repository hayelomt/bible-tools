import { describe, expect, it } from 'vitest';
import fixture from './fixtures/youversion-guess.json' with { type: 'json' };
import {
  exportRecords,
  type ImportedItem,
  importKey,
  nearestColour,
  recordItems,
} from './youversion.ts';

// The parser for the export as guessed in TECH-DESIGN §17.11 (M9-11). The fixture is made up in
// that format until the real M8-05 export arrives.

const items = (): ImportedItem[] => exportRecords(fixture).flatMap((r) => recordItems(r) ?? []);
/** Each item as "John 3:16 · BSB · yellow · note". */
const line = ({ ref, text, colour }: ImportedItem) =>
  [ref ? `${ref.display} · ${ref.versionLabel ?? ref.translation}` : '(note)', colour, text]
    .filter(Boolean)
    .join(' · ');

describe('the YouVersion export (guessed format)', () => {
  it('reads each highlight and note of the fixture', () => {
    expect(items().map(line)).toEqual([
      'John 3:16 · BSB · yellow',
      'Romans 7:24–8:2 · KJV · green',
      'Psalm 23:1 · NIV · Read this before the funeral.\nHe restores my soul.',
      'Psalm 23:4 · NIV',
      'Philippians 4:13 · NIV · pink',
      'Isaiah 40:31 · ESV · blue',
      'John 1:1 · shared · Ask Ann about the Greek in this one.',
      '(note) · Sermon idea: waiting well.',
      // Twice in the file: skipped when written (importInboxItems).
      'John 3:16 · BSB · yellow',
    ]);
  });

  it('keeps the date, and the exported verse text when there is one', () => {
    const [john, romans, , , philippians] = items();
    expect(john).toMatchObject({ receivedAt: '2025-03-02T08:15:00.000Z' });
    expect(romans!.receivedAt).toBe('2025-03-09T07:40:12.500Z');
    expect(romans!.ref).toMatchObject({ chapter: 7, verseStart: 24, chapterEnd: 8, verseEnd: 2 });
    expect(philippians!.ref).toMatchObject({
      translation: 'shared',
      versionLabel: 'NIV',
      snapshotText: 'I can do all this through him who gives me strength.',
    });
    expect(john!.ref).not.toHaveProperty('snapshotText');
  });

  it('takes the records alone or under `moments` or `data`', () => {
    const record = { kind: 'note', created_dt: '2025-01-01T00:00:00Z', content: 'x' };
    for (const file of [[record], { moments: [record] }, { data: [record] }]) {
      expect(exportRecords(file)).toEqual([record]);
    }
  });

  it.each([
    ['a string', 'hello'],
    ['an object without records', { highlights: 'none' }],
    ['nothing', null],
  ])('refuses %s', (_, json) => {
    expect(() => exportRecords(json)).toThrow('Not a YouVersion export Lamp can read');
  });

  it.each([
    ['without a date', { kind: 'note', content: 'x' }],
    ['with a date it can’t read', { kind: 'note', created_dt: 'last week', content: 'x' }],
    [
      'a highlight of no verse it knows',
      {
        kind: 'highlight',
        created_dt: '2025-01-01',
        references: [{ usfm: ['XYZ.1.1', 'JHN.99.1'] }],
      },
    ],
  ])('can’t read a record %s', (_, record) => {
    expect(recordItems(record)).toBeNull();
  });

  it('skips bookmarks', () => {
    expect(
      recordItems({
        kind: 'bookmark',
        created_dt: '2025-01-01',
        references: [{ usfm: ['GEN.1.1'] }],
      }),
    ).toEqual([]);
  });

  it('makes an item per run of verses, the note on the first', () => {
    const got = recordItems({
      kind: 'note',
      created_dt: '2025-01-01',
      content: 'Both',
      references: [{ version_id: 1, usfm: ['ROM.8.29', 'ROM.8.28', 'ROM.8.28', 'ROM.8.31'] }],
    });
    expect(got?.map((item) => [item.ref?.display, item.text])).toEqual([
      ['Romans 8:28–29', 'Both'],
      ['Romans 8:31', null],
    ]);
  });
});

describe('nearestColour', () => {
  it.each([
    ['fffe00', 'yellow'],
    ['#ffc66f', 'yellow'],
    ['5dff79', 'green'],
    ['00d6ff', 'blue'],
    ['ff95ef', 'pink'],
    ['not a colour', null],
    [null, null],
  ])('%s is %s', (hex, colour) => {
    expect(nearestColour(hex)).toBe(colour);
  });
});

describe('importKey', () => {
  it('matches on passage, time and text, however the time is written', () => {
    const [john] = items();
    expect(importKey({ ...john!, receivedAt: '2025-03-02T08:15:00Z' })).toBe(importKey(john!));
    expect(importKey({ ...john!, text: 'a note' })).not.toBe(importKey(john!));
  });
});
