import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BOOKS, type Passage, parseReference } from '@lamp/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { buildTranslation } from './build.ts';
import { passageText } from './lookup.ts';
import { SOURCES } from './sources.ts';
import type { BookText } from './usfm.ts';

const WEB = SOURCES.find((s) => s.id === 'WEB')!;

describe('buildTranslation with bad input', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bible-data-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const source = { ...WEB, dir };

  it('fails when a book is missing', () => {
    expect(() => buildTranslation(source)).toThrow('WEB: no USFM for GEN');
  });

  it('fails when the verse counts differ from the book table', () => {
    writeFileSync(join(dir, '02-GEN.usfm'), '\\id GEN\n\\c 1\n\\v 1 In the beginning.');
    expect(() => buildTranslation(source)).toThrow('WEB GEN: verse counts differ');
  });

  it('fails when a verse is missing', () => {
    writeFileSync(
      join(dir, '02-GEN.usfm'),
      '\\id GEN\n\\c 1\n\\v 1 In the beginning.\n\\v 3 Light.',
    );
    expect(() => buildTranslation(source)).toThrow('WEB GEN: missing 1:2');
  });
});

// Needs the WEB USFM (`pnpm --filter @lamp/bible-data download`; CI caches it).
describe.skipIf(!existsSync(join(WEB.dir, '.sha256')))('the WEB build', () => {
  const { manifest, files } = existsSync(WEB.dir)
    ? buildTranslation(WEB)
    : { manifest: undefined!, files: new Map<string, string>() };
  const bookText = (code: string): BookText => JSON.parse(files.get(manifest.books[code]!.file)!);
  const text = (reference: string) => {
    const parsed = parseReference(reference);
    if (!parsed.ok) throw new Error(reference);
    return passageText(bookText(parsed.ref.book), parsed.ref as Passage);
  };

  it('writes the 66 books, named by content hash, with their sizes in the manifest', () => {
    expect([...files.keys()].filter((f) => f.endsWith('.json'))).toHaveLength(66);
    expect(Object.keys(manifest.books)).toEqual(BOOKS.map((b) => b.code));
    for (const [code, entry] of Object.entries(manifest.books)) {
      expect(entry.file).toMatch(new RegExp(`^WEB/${code}\\.${entry.sha256.slice(0, 12)}\\.json$`));
      expect(Buffer.byteLength(files.get(entry.file)!)).toBe(entry.bytes);
    }
    const total = Object.values(manifest.books).reduce((n, b) => n + b.bytes, 0);
    expect(manifest.bytes).toBe(total);
    // The README records the size; this catches a large change in the output.
    expect(total).toBeGreaterThan(3_900_000);
    expect(total).toBeLessThan(4_300_000);
  });

  it('ships the licence notice unchanged', () => {
    expect(manifest.notice).toBe('WEB/copr.htm');
    expect(files.get('WEB/copr.htm')).toBe(readFileSync(join(WEB.dir, 'copr.htm'), 'utf8'));
    expect(files.get('WEB/copr.htm')).toContain('Public Domain');
  });

  it('is deterministic', () => {
    expect(buildTranslation(WEB).manifest).toEqual(manifest);
  });

  it('leaves no USFM markup in any verse, title or note', () => {
    const books = [...files].filter(([path]) => path.endsWith('.json')).map(([, json]) => json);
    for (const json of books) expect(json).not.toMatch(/\\|\|strong=|strong="/);
  });

  it.each([
    ['Genesis 1:1', 'In the beginning, God created the heavens and the earth.'],
    ['John 11:35', 'Jesus wept.'],
    [
      'John 3:16',
      'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.',
    ],
    ['Psalm 3:2', 'Many there are who say of my soul, “There is no help for him in God.” Selah.'],
    ['Jude 25', expect.stringMatching(/^to God our Savior, .* both now and forever\. Amen\.$/)],
    [
      'Romans 14:26',
      'to the only wise God, through Jesus Christ, to whom be the glory forever! Amen.',
    ],
    // Typed with KJV numbering, the doxology is found at its WEB place.
    [
      'Romans 16:27',
      'to the only wise God, through Jesus Christ, to whom be the glory forever! Amen.',
    ],
  ])('has the text of %s', (reference, expected) => {
    expect(text(reference)).toEqual(expected);
  });

  it('returns ranges, whole chapters and ranges across chapters', () => {
    expect(text('Psalm 117')).toBe(
      'Praise Yahweh, all you nations! Extol him, all you peoples! For his loving kindness is great toward us. Yahweh’s faithfulness endures forever. Praise Yah!',
    );
    expect(text('John 11:35-36')).toBe(
      'Jesus wept. The Jews therefore said, “See how much affection he had for him!”',
    );
    expect(text('Romans 8:39-9:1')).toMatch(/Christ Jesus our Lord\. I tell the truth in Christ/);
  });

  it('keeps the five empty verses as "" with their footnotes', () => {
    const empty = { LUK: ['17:36'], ACT: ['8:37', '15:34', '24:7'], ROM: ['16:25'] };
    for (const [code, verses] of Object.entries(empty)) {
      const book = bookText(code);
      expect(Object.keys(book.n!)).toEqual(verses);
      for (const ref of verses) {
        const [c, v] = ref.split(':').map(Number);
        expect(book.c[c! - 1]![v! - 1]).toBe('');
      }
    }
    expect(bookText('ACT').n!['8:37']).toMatch(/^TR adds Philip said, “If you believe/);
    const withNotes = BOOKS.filter((b) => bookText(b.code).n).map((b) => b.code);
    expect(withNotes).toEqual(['LUK', 'ACT', 'ROM']);
    const empties = BOOKS.flatMap((b) =>
      bookText(b.code)
        .c.flat()
        .filter((v) => v === ''),
    );
    expect(empties).toHaveLength(5);
  });

  it('keeps Psalm titles and the Psalm 119 letters outside the verses', () => {
    const psalms = bookText('PSA');
    expect(psalms.d!['3:1']).toBe('A Psalm by David, when he fled from Absalom his son.');
    expect(psalms.d!['119:1']).toBe('ALEPH');
    expect(psalms.d!['119:169']).toBe('TAV');
    expect(Object.keys(psalms.d!)).toHaveLength(138);
    expect(BOOKS.filter((b) => bookText(b.code).d).map((b) => b.code)).toEqual(['PSA']);
  });

  it('matches the source checksum recorded in the manifest', () => {
    expect(manifest.source.sha256).toBe(readFileSync(join(WEB.dir, '.sha256'), 'utf8'));
  });
});
