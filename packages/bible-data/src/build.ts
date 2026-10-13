import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOOKS } from '@lamp/domain';
import { type BookText, parseUsfm } from './usfm.ts';

/** `dist/manifest.json`: what the app downloads and caches (TECH-DESIGN §8.6, §9). */
export interface Manifest {
  version: 1;
  translations: Record<string, TranslationManifest>;
}

export interface TranslationManifest {
  name: string;
  licence: string;
  source: { url: string; sha256: string };
  /** The publisher's licence notice, copied unchanged from the source. */
  notice: string;
  /** Total size of the book files in bytes. */
  bytes: number;
  books: Record<string, BookManifest>;
}

export interface BookManifest {
  /** Path from the manifest, named by content hash, so it can be cached forever. */
  file: string;
  sha256: string;
  bytes: number;
  /** Verses per chapter. */
  verses: number[];
}

export interface TranslationSource {
  id: string;
  name: string;
  licence: string;
  url: string;
  sha256: string;
  /** The unzipped USFM files. */
  dir: string;
  /** The licence notice in `dir`, shipped next to the books. */
  notice: string;
}

export interface BuiltTranslation {
  manifest: TranslationManifest;
  /** File contents by path relative to `dist/`: the books and the licence notice. */
  files: Map<string, string>;
}

/**
 * Turns a translation's USFM into one JSON file per book, checking that every book is there and
 * that its chapter and verse counts match the domain book table.
 */
export function buildTranslation(source: TranslationSource): BuiltTranslation {
  const usfm = new Map<string, BookText>();
  for (const name of readdirSync(source.dir).filter((n) => n.endsWith('.usfm'))) {
    const { code, ...text } = parseUsfm(readFileSync(join(source.dir, name), 'utf8'));
    usfm.set(code, text);
  }

  const files = new Map<string, string>();
  const books: Record<string, BookManifest> = {};
  let bytes = 0;
  for (const book of BOOKS) {
    const text = usfm.get(book.code);
    if (!text) throw new Error(`${source.id}: no USFM for ${book.code}`);
    const verses = text.c.map((chapter) => chapter.length);
    const holes = text.c.flatMap((chapter, c) =>
      Array.from(chapter, (verse, v) => (verse === undefined ? `${c + 1}:${v + 1}` : [])).flat(),
    );
    if (holes.length > 0) throw new Error(`${source.id} ${book.code}: missing ${holes.join(', ')}`);
    if (JSON.stringify(verses) !== JSON.stringify(book.verses)) {
      throw new Error(`${source.id} ${book.code}: verse counts differ from the domain book table`);
    }

    const json = JSON.stringify(text);
    const sha256 = createHash('sha256').update(json).digest('hex');
    const file = `${source.id}/${book.code}.${sha256.slice(0, 12)}.json`;
    const size = Buffer.byteLength(json);
    files.set(file, json);
    books[book.code] = { file, sha256, bytes: size, verses };
    bytes += size;
  }

  const notice = `${source.id}/${source.notice}`;
  files.set(notice, readFileSync(join(source.dir, source.notice), 'utf8'));

  const manifest: TranslationManifest = {
    name: source.name,
    licence: source.licence,
    source: { url: source.url, sha256: source.sha256 },
    notice,
    bytes,
    books,
  };
  return { manifest, files };
}
