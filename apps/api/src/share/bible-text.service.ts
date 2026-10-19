import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { type BookText, type Manifest, quoteText } from '@lamp/bible-data';
import { type BookCode, type TranslationId, type VerseReader, type VerseRef } from '@lamp/domain';
import { Injectable, Logger } from '@nestjs/common';

/**
 * The Bible's text for the shared pages (decision 97): a chip keeps no text of the app's own, so
 * the page reads it from the book files `@lamp/bible-data` builds, in the translation the owner
 * picked. The files are found from the package, next to its source (`dist/`), as the web app
 * serves them; read once each and kept. Without them (not built), chips are their references.
 */
@Injectable()
export class BibleTextService {
  private readonly logger = new Logger(BibleTextService.name);
  private manifest: Promise<Manifest | null> | undefined;
  private readonly books = new Map<string, Promise<BookText | null>>();

  /** A reader of `refs` in `translation`, once their books are read. */
  async reader(translation: TranslationId, refs: readonly VerseRef[]): Promise<VerseReader> {
    const codes = new Set(refs.filter((ref) => !ref.translation).map((ref) => ref.book));
    const books = new Map(
      await Promise.all(
        [...codes].map(async (code) => [code, await this.book(translation, code)] as const),
      ),
    );
    return {
      translation,
      text: (passage) => {
        const book = books.get(passage.book);
        return book ? quoteText(book, passage, translation) : '';
      },
    };
  }

  private book(translation: TranslationId, code: BookCode): Promise<BookText | null> {
    const key = `${translation}:${code}`;
    let book = this.books.get(key);
    if (!book) {
      book = this.read(translation, code);
      this.books.set(key, book);
    }
    return book;
  }

  private async read(translation: TranslationId, code: BookCode): Promise<BookText | null> {
    const entry = (await this.loadManifest())?.translations[translation]?.books[code];
    if (!entry) return null;
    return JSON.parse(await readFile(new URL(entry.file, DIST), 'utf8')) as BookText;
  }

  private loadManifest(): Promise<Manifest | null> {
    this.manifest ??= readFile(new URL('manifest.json', DIST), 'utf8').then(
      (json) => JSON.parse(json) as Manifest,
      (error: unknown) => {
        this.logger.warn(`No Bible text for shared pages (${String(error)})`);
        return null;
      },
    );
    return this.manifest;
  }
}

/** `packages/bible-data/dist/`, beside the package's `src/index.ts`. */
const DIST = new URL(
  '../dist/',
  pathToFileURL(createRequire(import.meta.url).resolve('@lamp/bible-data')),
);
