import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { BOOKS } from '@lamp/domain';
import { readSource, type SourceBook } from './source.ts';

/** `dist/manifest.json`: what the app downloads and caches (TECH-DESIGN §8.6, §9). */
export interface Manifest {
  version: 1;
  translations: Record<string, TranslationManifest>;
}

export interface TranslationManifest {
  name: string;
  licence: string;
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
  /** The source JSON (see `readSource`). */
  file: string;
  /** Verses the translation leaves out, as "MAT 17:21". */
  omitted?: readonly string[];
}

export interface BuiltTranslation {
  manifest: TranslationManifest;
  /** File contents by path relative to `dist/`: one per book. */
  files: Map<string, string>;
}

/**
 * Turns a translation's source into one JSON file per book, checking that every verse has text
 * (or is one it leaves out) and that its chapter and verse counts match the domain book table.
 */
export function buildTranslation(
  source: TranslationSource,
  data: readonly SourceBook[] = JSON.parse(readFileSync(source.file, 'utf8')) as SourceBook[],
): BuiltTranslation {
  const texts = readSource(source.id, data, source.omitted);
  const files = new Map<string, string>();
  const books: Record<string, BookManifest> = {};
  let bytes = 0;
  for (const book of BOOKS) {
    const text = texts.get(book.code)!;
    const verses = text.c.map((chapter) => chapter.length);
    if (JSON.stringify(verses) !== JSON.stringify(book.verses)) {
      throw new Error(`${source.id} ${book.code}: verse counts differ from the domain book table`);
    }
    const empty = text.c.flatMap((chapter, c) =>
      chapter.flatMap((verse, v) =>
        verse || text.n?.[`${c + 1}:${v + 1}`] ? [] : `${c + 1}:${v + 1}`,
      ),
    );
    if (empty.length > 0) throw new Error(`${source.id} ${book.code}: empty ${empty.join(', ')}`);

    const json = JSON.stringify(text);
    const sha256 = createHash('sha256').update(json).digest('hex');
    const file = `${source.id}/${book.code}.${sha256.slice(0, 12)}.json`;
    const size = Buffer.byteLength(json);
    files.set(file, json);
    books[book.code] = { file, sha256, bytes: size, verses };
    bytes += size;
  }

  return { manifest: { name: source.name, licence: source.licence, bytes, books }, files };
}
