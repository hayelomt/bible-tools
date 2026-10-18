/// <reference lib="webworker" />
import { type Manifest, VerseTextIndex } from '@lamp/bible-data';
import { BOOKS, type BookCode, type TranslationId } from '@lamp/domain';
import { cachedBook, loadManifest, storedBook } from '@/data/bible-files.ts';
import type { MatcherReply, MatcherRequest } from './protocol.ts';

/**
 * The verse-text matcher (F19, M9-04, TECH-DESIGN §9), off the main thread: an index of every BSB
 * book, fetched where it isn't stored yet, and every KJV book downloaded to this device. A KJV
 * book downloaded later joins when the page says it arrived. Work runs in order, so a match asked
 * for while the index builds waits for it.
 */
declare const self: DedicatedWorkerGlobalScope;

const index = new VerseTextIndex();
let manifest: Manifest | undefined;
let queue: Promise<unknown> = Promise.resolve();
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
const post = (reply: MatcherReply) => self.postMessage(reply);

function enqueue(work: () => Promise<void> | void) {
  queue = queue
    .then(work)
    .catch((error: unknown) => post({ type: 'failed', message: String(error) }));
}

/** The BSB's book wherever it is; the KJV's only when it's downloaded. Null when it can't be had. */
async function readBook(translation: TranslationId, code: BookCode) {
  const entry = manifest?.translations[translation]?.books[code];
  if (!entry) return null;
  if (translation !== 'BSB') return cachedBook(entry.file);
  return storedBook(entry.file).then(
    (book) => book.text,
    () => null, // Offline before it was ever downloaded: matched once it's here.
  );
}

async function addBook(translation: TranslationId, code: BookCode) {
  if (index.has(translation, code)) return;
  const book = await readBook(translation, code);
  if (book) index.add(translation, code, book);
}

async function build() {
  const started = performance.now();
  manifest = await loadManifest();
  let books = 0;
  for (const translation of ['BSB', 'KJV'] as const) {
    for (const { code } of BOOKS) {
      await addBook(translation, code);
      if (index.has(translation, code)) books++;
    }
  }
  post({
    type: 'ready',
    buildMs: performance.now() - started,
    verses: index.size,
    bytes: index.bytes,
    books,
  });
}

self.addEventListener('message', (event: MessageEvent<MatcherRequest>) => {
  const request = event.data;
  if (request.type === 'book') {
    enqueue(() => addBook(request.translation, request.code));
    return;
  }
  enqueue(() => {
    try {
      post({ type: 'results', id: request.id, matches: index.match(request.text, request.hints) });
    } catch (error) {
      post({ type: 'failed', id: request.id, message: String(error) });
    }
  });
});

enqueue(build);
