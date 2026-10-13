import { type BookText, type Manifest, passageText, passageVerses } from '@lamp/bible-data';
import { type BookCode, DEFAULT_TRANSLATION, type Passage } from '@lamp/domain';
import { useSyncExternalStore } from 'react';

/**
 * The WEB text, as the book files `@lamp/bible-data` builds (TECH-DESIGN §9). The web app serves
 * them under `/bible/` (see vite.config.ts); a book is fetched the first time it's needed and
 * kept for the session. M2-11 keeps them offline with the service worker.
 */
export type BookState =
  | { status: 'loading' }
  | { status: 'ready'; text: BookText }
  /** Not downloaded, and couldn't be fetched (offline). Tried again after a while or once online. */
  | { status: 'missing' };

const BASE = '/bible/';
const RETRY_MS = 10_000;

let manifest: Promise<Manifest> | undefined;
const books = new Map<BookCode, BookState & { at?: number }>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  // Coming back online, try the books that failed straight away.
  window.addEventListener('online', () => {
    for (const [code, state] of books) if (state.status === 'missing') books.delete(code);
    notify();
  });
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(BASE + path);
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return (await response.json()) as T;
}

async function fetchBook(code: BookCode): Promise<BookText> {
  manifest ??= fetchJson<Manifest>('manifest.json').catch((error: unknown) => {
    manifest = undefined;
    throw error;
  });
  const entry = (await manifest).translations[DEFAULT_TRANSLATION]?.books[code];
  if (!entry) throw new Error(`${code} is not in the manifest`);
  return fetchJson<BookText>(entry.file);
}

/** The book's text if it's here; otherwise starts fetching it. */
export function bookState(code: BookCode): BookState {
  const known = books.get(code);
  if (known && !(known.status === 'missing' && Date.now() - known.at! > RETRY_MS)) return known;
  const loading: BookState = { status: 'loading' };
  books.set(code, loading);
  fetchBook(code)
    .then(
      (text) => books.set(code, { status: 'ready', text }),
      () => books.set(code, { status: 'missing', at: Date.now() }),
    )
    .finally(notify);
  return loading;
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
