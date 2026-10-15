import { BOOKS, type Passage, parseReference } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import type { BookText } from './book-text.ts';
import { buildTranslation } from './build.ts';
import { passageText } from './lookup.ts';
import { cleanVerse, OMITTED_NOTE, readSource, type SourceBook } from './source.ts';
import { SOURCES } from './sources.ts';

const BSB = SOURCES.find((s) => s.id === 'BSB')!;
const KJV = SOURCES.find((s) => s.id === 'KJV')!;

/** A source with every book's verses as the book table has them, each verse "v". */
function fakeSource(): SourceBook[] {
  return BOOKS.map((book) => ({
    abbrev: book.code.toLowerCase(),
    name: book.name,
    chapters: book.verses.map((count) => Array.from({ length: count }, () => 'v')),
  }));
}

describe('cleanVerse', () => {
  it.each([
    ['And Cain said unto the LORD , My punishment.', 'And Cain said unto the LORD, My punishment.'],
    ['the Salt Sea ).', 'the Salt Sea).'],
    ['for my sake. ’', 'for my sake.’'],
    ['the earth? ; yes !', 'the earth?; yes!'],
    ['is perfect.[’’]', 'is perfect.'],
    ['Elijah." ( vvv He did not know.)', 'Elijah." (He did not know.)'],
    ['Barnabas (vvv meaning Son of Encouragement),', 'Barnabas (meaning Son of Encouragement),'],
    ['she named vvv him Ben-oni.', 'she named him Ben-oni.'],
    // Supplied words in brackets, and straight quotes either side of a space, are kept.
    ['shekels [of silver] he made', 'shekels [of silver] he made'],
    ['to your offspring. " So Abram', 'to your offspring. " So Abram'],
  ])('%j → %j', (input, expected) => {
    expect(cleanVerse(input)).toBe(expected);
  });
});

describe('readSource', () => {
  it('matches books by position and puts omitted verses back as "" with a note', () => {
    const source = fakeSource();
    source[39]!.chapters[16]!.pop(); // MAT 17 is a verse short
    const books = readSource('X', source, ['MAT 17:21']);
    expect([...books.keys()]).toEqual(BOOKS.map((b) => b.code));
    const matthew = books.get('MAT')!;
    expect(matthew.c[16]).toHaveLength(27);
    expect(matthew.c[16]![20]).toBe('');
    expect(matthew.n).toEqual({ '17:21': OMITTED_NOTE });
    expect(books.get('GEN')!.n).toBeUndefined();
  });

  it('puts two gaps in one chapter back in order', () => {
    const source = fakeSource();
    const mark9 = source[40]!.chapters[8]!;
    mark9.splice(-2, 2, 'a', 'b'); // still 50; drop two to make 48
    mark9.splice(43, 2);
    const mark = readSource('X', source, ['MRK 9:46', 'MRK 9:44']).get('MRK')!;
    expect(mark.c[8]).toHaveLength(50);
    expect(mark.c[8]![43]).toBe('');
    expect(mark.c[8]![45]).toBe('');
    expect(mark.c[8]!.slice(-2)).toEqual(['a', 'b']);
  });

  it('fails without 66 books, or with an omitted verse it has no place for', () => {
    expect(() => readSource('X', fakeSource().slice(1))).toThrow('X: 65 books, expected 66');
    expect(() => readSource('X', fakeSource(), ['JUD 1:40'])).toThrow(
      'X JUD: no place for omitted 1:40',
    );
  });
});

describe('buildTranslation with bad input', () => {
  it('fails when the verse counts differ from the book table', () => {
    const source = fakeSource();
    source[0]!.chapters[0]!.pop();
    expect(() => buildTranslation(BSB, source)).toThrow('BSB GEN: verse counts differ');
  });

  it('fails when a verse is empty', () => {
    const source = fakeSource();
    source[0]!.chapters[0]![1] = ' ';
    expect(() => buildTranslation(KJV, source)).toThrow('KJV GEN: empty 1:2');
  });
});

describe.each([
  [BSB, 3_800_000, 4_100_000],
  [KJV, 4_000_000, 4_400_000],
])('the $id build', (source, min, max) => {
  const { manifest, files } = buildTranslation(source);
  const bookText = (code: string): BookText => JSON.parse(files.get(manifest.books[code]!.file)!);

  it('writes the 66 books, named by content hash, with their sizes in the manifest', () => {
    expect(files.size).toBe(66);
    expect(Object.keys(manifest.books)).toEqual(BOOKS.map((b) => b.code));
    for (const [code, entry] of Object.entries(manifest.books)) {
      expect(entry.file).toMatch(
        new RegExp(`^${source.id}/${code}\\.${entry.sha256.slice(0, 12)}\\.json$`),
      );
      expect(Buffer.byteLength(files.get(entry.file)!)).toBe(entry.bytes);
    }
    const total = Object.values(manifest.books).reduce((n, b) => n + b.bytes, 0);
    expect(manifest.bytes).toBe(total);
    // The README records the size; this catches a large change in the output.
    expect(total).toBeGreaterThan(min);
    expect(total).toBeLessThan(max);
  });

  it('is deterministic', () => {
    expect(buildTranslation(source).manifest).toEqual(manifest);
  });

  it('leaves none of the source’s stray markup in any verse', () => {
    for (const json of files.values()) {
      expect(json).not.toMatch(/\[’’\]|\bvvv\b| [,.;:?!)’]|\( |  /);
    }
  });

  it('numbers verses the KJV’s way: the doxology is Romans 16:25–27', () => {
    expect(bookText('ROM').c[13]).toHaveLength(23);
    expect(bookText('ROM').c[15]).toHaveLength(27);
    expect(bookText('ROM').c[15]![26]).toMatch(/^to (the only wise God|God only wise)/i);
  });

  const text = (reference: string) => {
    const parsed = parseReference(reference);
    if (!parsed.ok) throw new Error(reference);
    return passageText(bookText(parsed.ref.book), parsed.ref as Passage);
  };

  it('returns verses, ranges and ranges across chapters', () => {
    expect(text('John 11:35')).toBe('Jesus wept.');
    expect(text('Genesis 1:1')).toMatch(
      /^In the beginning God created the heavens? and the earth\.$/,
    );
    expect(text('Psalm 117')).toBe(bookText('PSA').c[116]!.join(' '));
    expect(bookText('PSA').c[116]).toHaveLength(2);
    expect(text('Romans 8:39-9:1')).toMatch(
      /Christ Jesus our Lord\. I (speak|say) the truth in Christ/,
    );
  });
});

describe('the BSB text', () => {
  const { manifest, files } = buildTranslation(BSB);
  const bookText = (code: string): BookText => JSON.parse(files.get(manifest.books[code]!.file)!);

  it('keeps the 16 verses it leaves out as "" with a note, so later verses keep their numbers', () => {
    const empty = BOOKS.flatMap((b) => {
      const book = bookText(b.code);
      return book.c.flatMap((verses, c) =>
        verses.flatMap((verse, v) => (verse ? [] : `${b.code} ${c + 1}:${v + 1}`)),
      );
    });
    expect(empty).toEqual(BSB.omitted);
    expect(bookText('ACT').n).toEqual({
      '8:37': OMITTED_NOTE,
      '15:34': OMITTED_NOTE,
      '24:7': OMITTED_NOTE,
      '28:29': OMITTED_NOTE,
    });
    expect(bookText('MAT').c[16]![21]).toMatch(/^When they gathered together in Galilee/);
    expect(bookText('ACT').c[7]![37]).toMatch(/^And he gave orders to stop the chariot/);
  });

  it('has the BSB’s words', () => {
    expect(bookText('JHN').c[2]![15]).toBe(
      'For God so loved the world that He gave His one and only Son, that everyone who believes in Him shall not perish but have eternal life.',
    );
  });
});

describe('the KJV text', () => {
  const { manifest, files } = buildTranslation(KJV);
  const bookText = (code: string): BookText => JSON.parse(files.get(manifest.books[code]!.file)!);

  it('leaves no verse out', () => {
    for (const book of BOOKS) expect(bookText(book.code).n).toBeUndefined();
    expect(bookText('ACT').c[7]![36]).toMatch(/^And Philip said, If thou believest/);
  });

  it('has the KJV’s words', () => {
    expect(bookText('JHN').c[2]![15]).toBe(
      'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.',
    );
  });
});
