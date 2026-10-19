import { type BookText, passageVerses } from '@lamp/bible-data';
import type { BookCode, Passage, TranslationId } from '@lamp/domain';
import { useSyncExternalStore } from 'react';
import { loadManifest, storedBook } from './bible-files.ts';

export {
  BIBLE_CACHE,
  bibleCache,
  bookUrl,
  loadManifest,
  quoteText,
  storedBook,
} from './bible-files.ts';

/**
 * The Bible text, as the book files `@lamp/bible-data` builds (TECH-DESIGN §9), served under
 * `/bible/` (see vite.config.ts). Files are kept in Cache Storage, so they're there offline: a
 * book is read from it first (its file is named by content hash, so a stored copy is never stale),
 * and the manifest from the network first, so a corrected edition is picked up. `bible-download.ts`
 * fills the cache in the background (M2-11); a book needed before then is fetched on its own. Each
 * translation's books are kept apart: a chip reads the one it was captured from.
 */
export type BookState =
  | { status: 'loading' }
  | { status: 'ready'; text: BookText }
  /** Not downloaded, and couldn't be fetched (offline). Tried again after a while or once online. */
  | { status: 'missing' };

const RETRY_MS = 10_000;

/** By `key`: one translation's book. */
const books = new Map<string, BookState & { at?: number }>();
const listeners = new Set<() => void>();
const arrivals = new Set<(translation: TranslationId, code: BookCode) => void>();

function key(translation: TranslationId, code: BookCode): string {
  return `${translation}:${code}`;
}

function notify() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls `listener` each time a book's text arrives on this device (fetched or downloaded). */
export function onBookArrived(
  listener: (translation: TranslationId, code: BookCode) => void,
): () => void {
  arrivals.add(listener);
  return () => arrivals.delete(listener);
}

/** A book is stored: one that couldn't be fetched is read again, and listeners hear of it. */
export function bookArrived(translation: TranslationId, code: BookCode) {
  if (books.get(key(translation, code))?.status === 'missing') books.delete(key(translation, code));
  notify();
  for (const listener of arrivals) listener(translation, code);
}

/** A translation's books were removed from the device: they're read again when next wanted. */
export function forgetTranslation(translation: TranslationId) {
  for (const k of books.keys()) if (k.startsWith(`${translation}:`)) books.delete(k);
  notify();
}

if (typeof window !== 'undefined') {
  // Coming back online, try the books that failed straight away.
  window.addEventListener('online', () => {
    for (const [k, state] of books) if (state.status === 'missing') books.delete(k);
    notify();
  });
}

async function fetchBook(translation: TranslationId, code: BookCode): Promise<BookText> {
  const entry = (await loadManifest()).translations[translation]?.books[code];
  if (!entry) throw new Error(`${translation} ${code} is not in the manifest`);
  return (await storedBook(entry.file)).text;
}

/** The book's text if it's here; otherwise starts fetching it. */
export function bookState(translation: TranslationId, code: BookCode): BookState {
  const k = key(translation, code);
  const known = books.get(k);
  if (known && !(known.status === 'missing' && Date.now() - known.at! > RETRY_MS)) return known;
  const loading: BookState = { status: 'loading' };
  books.set(k, loading);
  fetchBook(translation, code).then(
    (text) => {
      // Removed while it was on its way: it's fetched again when next wanted.
      if (books.get(k) !== loading) return;
      books.set(k, { status: 'ready', text });
      bookArrived(translation, code);
    },
    () => {
      if (books.get(k) !== loading) return;
      books.set(k, { status: 'missing', at: Date.now() });
      notify();
    },
  );
  return loading;
}

/** The book's text once it's fetched (at once if it's here), or null if it can't be. */
export function whenBook(translation: TranslationId, code: BookCode): Promise<BookText | null> {
  return new Promise((resolve) => {
    /** True once the book is here or missing. */
    const settled = () => {
      const state = bookState(translation, code);
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
export function useBook(translation: TranslationId, code: BookCode): BookState {
  return useSyncExternalStore(subscribe, () => bookState(translation, code));
}

/**
 * Several books' texts, as `useBook` gives one: for a list that can change length (a lesson's main
 * passages), which can't call a hook per book.
 */
export function useBooks(
  wanted: readonly { translation: TranslationId; book: BookCode }[],
): BookState[] {
  // A string, so an unchanged set of states is the same snapshot.
  useSyncExternalStore(subscribe, () =>
    wanted.map((w) => bookState(w.translation, w.book).status).join(),
  );
  return wanted.map((w) => bookState(w.translation, w.book));
}

/** A verse of a passage's text, with its number: "28", or "9:1" where a new chapter starts. */
export interface NumberedVerse {
  label: string;
  text: string;
}

/**
 * A passage's text split into its numbered verses, from the book's verse texts. It's split only
 * where the book's verses join up to exactly the text, so null for text from elsewhere, or for an
 * empty verse's footnote.
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
