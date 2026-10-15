import { type BookCode, TRANSLATIONS, type TranslationId } from '@lamp/domain';
import { useSyncExternalStore } from 'react';
import {
  bibleCache,
  bookArrived,
  bookUrl,
  forgetTranslation,
  loadManifest,
  storedBook,
} from './bible.ts';

/** Where a translation's download stands (wireframes/shell.md "Bible download"). */
export type DownloadState =
  /** Not on this device, or not looked at yet; books load as they're opened. */
  | { status: 'none' }
  | { status: 'starting' }
  | { status: 'downloading'; done: number; total: number }
  /** A file couldn't be fetched (no connection); it goes on once online. */
  | { status: 'paused'; done: number; total: number }
  | { status: 'complete'; total: number; bytes: number }
  /** No Cache Storage here (not a secure context): books are fetched as they're needed. */
  | { status: 'unavailable' };

/** Waits this long to try again when the browser doesn't say it's back online. */
export const RETRY_MS = 30_000;

const NONE: DownloadState = { status: 'none' };
const states = new Map<TranslationId, DownloadState>();
const running = new Map<TranslationId, Promise<void>>();
const listeners = new Set<() => void>();

function set(translation: TranslationId, next: DownloadState) {
  states.set(translation, next);
  for (const listener of listeners) listener();
}

function stateOf(translation: TranslationId): DownloadState {
  return states.get(translation) ?? NONE;
}

/** The address prefix of a translation's book files. */
function folder(translation: TranslationId): string {
  return bookUrl(`${translation}/`);
}

/**
 * Downloads every book of a translation into the Bible's cache, one after another (TECH-DESIGN
 * §8.6), so any book opens offline: the active translation after the first load, another when the
 * user asks in settings. Books already stored are skipped, so it's quick after the first time;
 * files from an older edition are removed at the end. Without a connection it pauses, and goes on
 * when the browser is back online (or after `RETRY_MS`). Safe to call more than once.
 */
export function downloadBible(translation: TranslationId): Promise<void> {
  let run = running.get(translation);
  if (!run) {
    run = download(translation).finally(() => running.delete(translation));
    running.set(translation, run);
  }
  return run;
}

async function download(translation: TranslationId): Promise<void> {
  const before = stateOf(translation);
  let done = before.status === 'paused' ? before.done : 0;
  let total = before.status === 'paused' ? before.total : 0;
  if (before.status !== 'paused') set(translation, { status: 'starting' });
  try {
    const manifest = (await loadManifest()).translations[translation];
    if (!manifest) throw new Error(`${translation} is not in the manifest`);
    const books = Object.entries(manifest.books);
    const cache = await bibleCache();
    if (!cache) {
      set(translation, { status: 'unavailable' });
      return;
    }
    const stored = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const missing = books.filter(([, entry]) => !stored.has(bookUrl(entry.file)));
    total = books.length;
    done = total - missing.length;
    for (const [code, entry] of missing) {
      set(translation, { status: 'downloading', done, total });
      if ((await storedBook(entry.file)).fetched) bookArrived(translation, code as BookCode);
      done += 1;
    }
    // An older edition's files, left when a book was corrected, and a dropped translation's.
    const current = new Set(books.map(([, entry]) => bookUrl(entry.file)));
    for (const request of await cache.keys()) {
      const path = new URL(request.url).pathname;
      const old = path.startsWith(folder(translation)) && !current.has(path);
      const dropped =
        !path.endsWith('/manifest.json') && !TRANSLATIONS.some((t) => path.startsWith(folder(t)));
      if (old || dropped) await cache.delete(request);
    }
    set(translation, { status: 'complete', total, bytes: manifest.bytes });
  } catch {
    set(translation, { status: 'paused', done, total });
    void resumeLater(translation);
  }
}

function resumeLater(translation: TranslationId): Promise<void> {
  return new Promise((resolve) => {
    const resume = () => {
      clearTimeout(timer);
      window.removeEventListener('online', resume);
      resolve(downloadBible(translation));
    };
    const timer = setTimeout(resume, RETRY_MS);
    window.addEventListener('online', resume);
  });
}

/**
 * Looks at what's stored of a translation that isn't downloading, so settings can say whether it's
 * on this device: complete when every book is, else none.
 */
export async function checkBible(translation: TranslationId): Promise<void> {
  if (running.has(translation) || stateOf(translation).status !== 'none') return;
  try {
    const manifest = (await loadManifest()).translations[translation];
    const cache = await bibleCache();
    if (!manifest || !cache || running.has(translation)) return;
    const stored = new Set((await cache.keys()).map((r) => new URL(r.url).pathname));
    const books = Object.values(manifest.books);
    if (books.every((entry) => stored.has(bookUrl(entry.file)))) {
      set(translation, { status: 'complete', total: books.length, bytes: manifest.bytes });
    }
  } catch {
    // Offline with no manifest stored: it stays unknown.
  }
}

/** Removes a translation's books from the device; they're fetched again if opened. */
export async function removeBible(translation: TranslationId): Promise<void> {
  await running.get(translation);
  const cache = await bibleCache();
  if (cache) {
    for (const request of await cache.keys()) {
      if (new URL(request.url).pathname.startsWith(folder(translation)))
        await cache.delete(request);
    }
  }
  forgetTranslation(translation);
  set(translation, NONE);
}

/** A translation's download progress, re-rendering as it changes. */
export function useBibleDownload(translation: TranslationId): DownloadState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => stateOf(translation),
  );
}

/** Every translation's download status, as one string that changes when any of them does. */
export function useDownloadStatuses(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => TRANSLATIONS.map((t) => stateOf(t).status).join(' '),
  );
}
