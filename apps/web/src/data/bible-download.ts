import { type BookCode, DEFAULT_TRANSLATION } from '@lamp/domain';
import { useSyncExternalStore } from 'react';
import { bibleCache, bookArrived, bookUrl, loadManifest, storedBook } from './bible.ts';

/** Where the background download of the WEB text stands (wireframes/shell.md "Bible download"). */
export type DownloadState =
  | { status: 'starting' }
  | { status: 'downloading'; done: number; total: number }
  /** A file couldn't be fetched (no connection); it goes on once online. */
  | { status: 'paused'; done: number; total: number }
  | { status: 'complete'; total: number; bytes: number }
  /** No Cache Storage here (not a secure context): books are fetched as they're needed. */
  | { status: 'unavailable' };

/** Waits this long to try again when the browser doesn't say it's back online. */
export const RETRY_MS = 30_000;

let state: DownloadState = { status: 'starting' };
let running: Promise<void> | undefined;
const listeners = new Set<() => void>();

function set(next: DownloadState) {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Downloads every WEB book into the Bible's cache, one after another, after the first load
 * (TECH-DESIGN §8.6), so any book opens offline. Books already stored are skipped, so it's quick
 * after the first time; files from an older edition are removed at the end. Without a connection
 * it pauses, and goes on when the browser is back online (or after `RETRY_MS`). Safe to call more
 * than once.
 */
export function downloadBible(): Promise<void> {
  running ??= run().finally(() => {
    running = undefined;
  });
  return running;
}

async function run(): Promise<void> {
  let done = state.status === 'paused' ? state.done : 0;
  let total = state.status === 'paused' ? state.total : 0;
  try {
    const translation = (await loadManifest()).translations[DEFAULT_TRANSLATION];
    if (!translation) throw new Error(`${DEFAULT_TRANSLATION} is not in the manifest`);
    const books = Object.entries(translation.books);
    const cache = await bibleCache();
    if (!cache) {
      set({ status: 'unavailable' });
      return;
    }
    const stored = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const missing = books.filter(([, entry]) => !stored.has(bookUrl(entry.file)));
    total = books.length;
    done = total - missing.length;
    for (const [code, entry] of missing) {
      set({ status: 'downloading', done, total });
      if ((await storedBook(entry.file)).fetched) bookArrived(code as BookCode);
      done += 1;
    }
    // An older edition's files, left when a book was corrected.
    const current = new Set(books.map(([, entry]) => bookUrl(entry.file)));
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      if (path.endsWith('.json') && !path.endsWith('/manifest.json') && !current.has(path)) {
        await cache.delete(request);
      }
    }
    set({ status: 'complete', total, bytes: translation.bytes });
  } catch {
    set({ status: 'paused', done, total });
    void resumeLater();
  }
}

function resumeLater(): Promise<void> {
  return new Promise((resolve) => {
    const resume = () => {
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      resolve(downloadBible());
    };
    const timer = setTimeout(resume, RETRY_MS);
    window.addEventListener('online', resume);
  });
}

/** The download's progress, re-rendering as it changes. */
export function useBibleDownload(): DownloadState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
}
