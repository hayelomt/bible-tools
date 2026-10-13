import { type BookText, type Manifest, passageText, passageVerses } from '@lamp/bible-data';
import { type BookCode, DEFAULT_TRANSLATION, type Passage } from '@lamp/domain';
import { useSyncExternalStore } from 'react';

/**
 * The WEB text, as the book files `@lamp/bible-data` builds (TECH-DESIGN §9), served under
 * `/bible/` (see vite.config.ts). Files are kept in Cache Storage, so they're there offline: a
 * book is read from it first (its file is named by content hash, so a stored copy is never stale),
 * and the manifest from the network first, so a corrected edition is picked up. `bible-download.ts`
 * fills the cache in the background (M2-11); a book needed before then is fetched on its own.
 */
export type BookState =
  | { status: 'loading' }
  | { status: 'ready'; text: BookText }
  /** Not downloaded, and couldn't be fetched (offline). Tried again after a while or once online. */
  | { status: 'missing' };

const BASE = '/bible/';
const MANIFEST = `${BASE}manifest.json`;
export const BIBLE_CACHE = 'lamp-bible';
const RETRY_MS = 10_000;

let manifest: Promise<Manifest> | undefined;
const books = new Map<BookCode, BookState & { at?: number }>();
const listeners = new Set<() => void>();
const arrivals = new Set<(code: BookCode) => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls `listener` each time a book's text arrives on this device (fetched or downloaded). */
export function onBookArrived(listener: (code: BookCode) => void): () => void {
  arrivals.add(listener);
  return () => arrivals.delete(listener);
}

/** A book is stored: one that couldn't be fetched is read again, and listeners hear of it. */
export function bookArrived(code: BookCode) {
  if (books.get(code)?.status === 'missing') books.delete(code);
  notify();
  for (const listener of arrivals) listener(code);
}

if (typeof window !== 'undefined') {
  // Coming back online, try the books that failed straight away.
  window.addEventListener('online', () => {
    for (const [code, state] of books) if (state.status === 'missing') books.delete(code);
    notify();
  });
}

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

async function fetchBook(code: BookCode): Promise<BookText> {
  const entry = (await loadManifest()).translations[DEFAULT_TRANSLATION]?.books[code];
  if (!entry) throw new Error(`${code} is not in the manifest`);
  return (await storedBook(entry.file)).text;
}

/** The book's text if it's here; otherwise starts fetching it. */
export function bookState(code: BookCode): BookState {
  const known = books.get(code);
  if (known && !(known.status === 'missing' && Date.now() - known.at! > RETRY_MS)) return known;
  const loading: BookState = { status: 'loading' };
  books.set(code, loading);
  fetchBook(code).then(
    (text) => {
      books.set(code, { status: 'ready', text });
      bookArrived(code);
    },
    () => {
      books.set(code, { status: 'missing', at: Date.now() });
      notify();
    },
  );
  return loading;
}

/** The book's text once it's fetched (at once if it's here), or null if it can't be. */
export function whenBook(code: BookCode): Promise<BookText | null> {
  return new Promise((resolve) => {
    /** True once the book is here or missing. */
    const settled = () => {
      const state = bookState(code);
      if (state.status === 'loading') return false;
      resolve(state.status === 'ready' ? state.text : null);
      return true;
    };
    if (settled()) return;
    const unsubscribe = subscribe(() => {
      if (settled()) unsubscribe();
    });
  });
}

/** The book's text, re-rendering when it arrives. */
export function useBook(code: BookCode): BookState {
  return useSyncExternalStore(subscribe, () => bookState(code));
}

/**
 * A chip's snapshot (F3): the passage's verse texts. WEB leaves four verses empty (Luke 17:36, Acts
 * 8:37, 15:34, 24:7) with a footnote; on its own, such a verse snapshots as that footnote, marked
 * (decided 2026-10-13), so a chip never holds nothing. In a range they're skipped.
 */
export function snapshotText(book: BookText, passage: Passage): string {
  const text = passageText(book, passage);
  if (text) return text;
  const notes = passageVerses(book, passage)
    .map((v) => book.n?.[`${v.chapter}:${v.verse}`])
    .filter(Boolean);
  return notes.length > 0 ? `[Not in ${DEFAULT_TRANSLATION}: ${notes.join(' ')}]` : '';
}

/** A verse of a snapshot, with its number: "28", or "9:1" where a new chapter starts. */
export interface NumberedVerse {
  label: string;
  text: string;
}

/**
 * A snapshot split into its numbered verses, from the book's verse texts. The text shown is still
 * the snapshot: it's split only where the book's verses join up to exactly it, so null when the
 * text was captured from an edition since corrected, or for an empty verse's footnote.
 */
export function numberedVerses(
  book: BookText,
  passage: Passage,
  snapshot: string,
): NumberedVerse[] | null {
  // A chip's node holds its unset fields as null; a passage leaves them out.
  const cleaned = Object.fromEntries(Object.entries(passage).filter(([, v]) => v !== null));
  const verses = passageVerses(book, cleaned as Passage).filter((v) => v.text);
  if (verses.length === 0 || verses.map((v) => v.text).join(' ') !== snapshot) return null;
  return verses.map((v, i) => ({
    label: i > 0 && v.chapter !== verses[i - 1]!.chapter ? `${v.chapter}:${v.verse}` : `${v.verse}`,
    text: v.text,
  }));
}
