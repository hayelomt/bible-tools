import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { BOOKS } from '@lamp/domain';
import { describe, expect, it } from 'vitest';

// The WEB USFM from eBible.org (eng-web_usfm.zip), unzipped. M1-12 puts it here; until then the
// check is skipped, and the domain tests still check the totals and spot values.
const SOURCE = new URL('../source/eng-web/', import.meta.url);

/** Verses per chapter in one USFM book: the highest \v number in each \c. */
function countVerses(usfm: string): number[] {
  const verses: number[] = [];
  for (const [, marker, number, rangeEnd] of usfm.matchAll(/\\([cv]) (\d+)(?:-(\d+))?/g)) {
    if (marker === 'c') verses.push(0);
    else verses[verses.length - 1] = Math.max(verses.at(-1)!, Number(rangeEnd ?? number));
  }
  return verses;
}

describe.skipIf(!existsSync(SOURCE))('domain book table against the WEB USFM', () => {
  const files = existsSync(SOURCE) ? readdirSync(SOURCE) : [];

  it.each(BOOKS.map((book) => [book.code, book] as const))('%s', (code, book) => {
    const file = files.find((name) =>
      name.slice(name.indexOf('-') + 1).startsWith(`${code}eng-web`),
    );
    expect(file, `no USFM file for ${code}`).toBeDefined();
    expect(countVerses(readFileSync(new URL(file!, SOURCE), 'utf8'))).toEqual(book.verses);
  });
});
