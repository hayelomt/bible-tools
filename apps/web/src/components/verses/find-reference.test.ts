import { describe, expect, it } from 'vitest';
import { findReference, type ReferenceEntry } from './find-reference.ts';

/** The typed text found, and the rows as display text (errors in brackets). */
function found(before: string) {
  const match = findReference(before);
  if (!match) return null;
  expect(before.slice(match.from)).toBe(match.text);
  return { text: match.text, rows: match.entries.map(row) };
}

function row(entry: ReferenceEntry): string {
  return entry.kind === 'passage' ? entry.ref.display : `[${entry.message}]`;
}

describe('findReference', () => {
  it.each([
    ['Rom 8:28-30', 'Romans 8:28–30'],
    ['1 Jn 3', '1 John 3'],
    ['romns 8', 'Romans 8'],
    ['Rom 8:38–9:5', 'Romans 8:38–9:5'],
    ['First John 3:16', '1 John 3:16'],
    ['I John 3', '1 John 3'],
    ['Song of Songs 2:1', 'Song of Solomon 2:1'],
    ['Jude 3', 'Jude 3'],
    ['Ps 23', 'Psalm 23'],
  ])('completes %s as %s', (typed, display) => {
    expect(found(typed)).toEqual({ text: typed, rows: [display] });
    expect(found(`Paul says in ${typed}`)).toEqual({ text: typed, rows: [display] });
  });

  it('opens once a number is typed, and stays open on a trailing separator', () => {
    expect(findReference('Paul wrote to the Romans')).toBeNull();
    expect(findReference('Romans ')).toBeNull();
    expect(found('see Rom 8')?.rows).toEqual(['Romans 8']);
    expect(found('see Rom 8:')?.rows).toEqual(['Romans 8']);
    expect(found('see Rom 8:28–')?.rows).toEqual(['Romans 8:28']);
  });

  it('closes once something else is typed after the reference', () => {
    expect(findReference('Rom 8:28 ')).toBeNull();
    expect(findReference('Rom 8:28 says')).toBeNull();
    expect(findReference('Rom 8:28, and')).toBeNull();
  });

  it('lists every book a short name could be', () => {
    expect(found('see jo 3')).toEqual({
      text: 'jo 3',
      rows: ['Joshua 3', 'Job 3', 'Joel 3', 'Jonah 3', 'John 3'],
    });
  });

  it('takes a book number along, but not a word before a misspelling', () => {
    expect(found('read 1 Jhon 3')?.text).toBe('1 Jhon 3');
    expect(found('read 1 Jhon 3')?.rows).toEqual(['1 John 3']);
    expect(found('a romns 8')?.text).toBe('romns 8');
    expect(found('so Amos 3')?.text).toBe('Amos 3');
  });

  it('starts at a word, after punctuation or a chip', () => {
    expect(found('(Rom 8:28')?.text).toBe('Rom 8:28');
    expect(found('see ￼Rom 8')?.text).toBe('Rom 8');
    expect(findReference('Fromage 8')).toBeNull();
  });

  it('says when the numbers are past the end of a book', () => {
    expect(found('Rom 17')).toEqual({ text: 'Rom 17', rows: ['[Romans has 16 chapters.]'] });
    expect(found('see Jude 30')?.rows).toEqual(['[Jude 1 has 25 verses.]']);
    expect(found('Rom 8:30-28')?.rows).toEqual(['[The end of the range comes before its start.]']);
  });

  it('shows nothing for numbers after words that are no book', () => {
    expect(findReference('page 12')).toBeNull();
    expect(findReference('at 10:30')).toBeNull();
    expect(findReference('8:28')).toBeNull();
  });

  it('notes KJV numbering moved onto WEB’s', () => {
    expect(findReference('Rom 16:25-27')?.entries).toEqual([
      expect.objectContaining({
        ref: expect.objectContaining({ display: 'Romans 14:24–26' }),
        mappedFrom: 'Romans 16:25–27',
      }),
    ]);
  });

  it('only looks at the end of a long paragraph', () => {
    const long = `${'word '.repeat(200)}and Rom 8:28`;
    expect(found(long)?.text).toBe('Rom 8:28');
  });
});
