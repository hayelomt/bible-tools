import { type BookText, type Manifest, passageText, passageVerses } from '@lamp/bible-data';
import type { Passage, TranslationId } from '@lamp/domain';

/**
 * The Bible's files in Cache Storage (TECH-DESIGN §8.6), without React, so the verse matcher's
 * worker reads them as the page does. `bible.ts` keeps each book's state for the screens.
 */

const BASE = '/bible/';
const MANIFEST = `${BASE}manifest.json`;
export const BIBLE_CACHE = 'lamp-bible';

let manifest: Promise<Manifest> | undefined;

/** The Bible's cache, where there is Cache Storage (a secure context; not in unit tests). */
export async function bibleCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  return caches.open(BIBLE_CACHE).catch(() => null);
}

async function fetchOk(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

/** The manifest: from the network, else the copy stored the last time (offline). */
export function loadManifest(): Promise<Manifest> {
  manifest ??= (async () => {
    const cache = await bibleCache();
    try {
      const response = await fetchOk(MANIFEST);
      await cache?.put(MANIFEST, response.clone());
      return (await response.json()) as Manifest;
    } catch (error) {
      const stored = await cache?.match(MANIFEST);
      if (!stored) throw error;
      return (await stored.json()) as Manifest;
    }
  })().catch((error: unknown) => {
    manifest = undefined;
    throw error;
  });
  return manifest;
}

/** A book file's address, from its manifest entry. */
export function bookUrl(file: string): string {
  return BASE + file;
}

/** A book file: the stored copy, else fetched and stored. */
export async function storedBook(file: string): Promise<{ text: BookText; fetched: boolean }> {
  const url = bookUrl(file);
  const cache = await bibleCache();
  const stored = await cache?.match(url);
  if (stored) return { text: (await stored.json()) as BookText, fetched: false };
  const response = await fetchOk(url);
  await cache?.put(url, response.clone());
  return { text: (await response.json()) as BookText, fetched: true };
}

/** A book file if it's stored on the device; never fetched. */
export async function cachedBook(file: string): Promise<BookText | null> {
  const stored = await (await bibleCache())?.match(bookUrl(file));
  return stored ? ((await stored.json()) as BookText) : null;
}

/**
 * A chip's snapshot (F3): the passage's verse texts. The BSB leaves 16 verses empty (Acts 8:37 and
 * others) with a note; on its own, such a verse snapshots as that note, marked (decided
 * 2026-10-13), so a chip never holds nothing. In a range they're skipped.
 */
export function snapshotText(book: BookText, passage: Passage, translation: TranslationId): string {
  const text = passageText(book, passage);
  if (text) return text;
  const notes = passageVerses(book, passage)
    .map((v) => book.n?.[`${v.chapter}:${v.verse}`])
    .filter(Boolean);
  return notes.length > 0 ? `[Not in ${translation}: ${[...new Set(notes)].join(' ')}]` : '';
}
