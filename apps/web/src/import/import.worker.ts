/// <reference lib="webworker" />
import { type BookCode, isAppTranslation, type TranslationId } from '@lamp/domain';
import type { BookText } from '@lamp/bible-data';
import { loadManifest, snapshotText, storedBook } from '@/data/bible-files.ts';
import type { ImportReply, ImportRequest } from './protocol.ts';
import { exportRecords, type ImportedItem, ImportFormatError, recordItems } from './youversion.ts';

/**
 * The YouVersion import (F21, M9-11), off the main thread: reads the export file, turns each
 * highlight and note into inbox items with progress as it goes, and fills a BSB or KJV chip the
 * export left without text from Lamp's book (decision 69: Lamp's text only when none came). The
 * page writes the items in one action, so a cancelled import adds nothing.
 */
declare const self: DedicatedWorkerGlobalScope;

// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
const post = (reply: ImportReply) => self.postMessage(reply);
/** Progress is posted this often, in records. */
const STEP = 50;

async function read(file: Blob) {
  let json: unknown;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new ImportFormatError('not JSON');
  }
  const records = exportRecords(json);
  post({ type: 'total', total: records.length });
  const items: ImportedItem[] = [];
  let unreadable = 0;
  for (const [i, record] of records.entries()) {
    const found = recordItems(record);
    if (found) items.push(...found);
    else unreadable++;
    if ((i + 1) % STEP === 0) post({ type: 'progress', done: i + 1 });
  }
  if (records.length > 0 && unreadable === records.length) {
    throw new ImportFormatError('none of its records could be read');
  }
  await fillText(items);
  post({ type: 'progress', done: records.length });
  post({ type: 'done', items });
}

/** Each BSB or KJV chip without text gets its book's, where the book can be had. */
async function fillText(items: ImportedItem[]) {
  const waiting = items.filter(
    (item) => item.ref && !item.ref.snapshotText && isAppTranslation(item.ref.translation),
  );
  if (waiting.length === 0) return;
  const manifest = await loadManifest().catch(() => null);
  const books = new Map<string, Promise<BookText | null>>();
  const book = (translation: TranslationId, code: BookCode) => {
    const key = `${translation}:${code}`;
    if (!books.has(key)) {
      const entry = manifest?.translations[translation]?.books[code];
      // Offline before the book was ever downloaded: the chip goes in without its text.
      books.set(
        key,
        entry
          ? storedBook(entry.file).then(
              (b) => b.text,
              () => null,
            )
          : Promise.resolve(null),
      );
    }
    return books.get(key)!;
  };
  for (const item of waiting) {
    const ref = item.ref!;
    const translation = ref.translation as TranslationId;
    const text = await book(translation, ref.book);
    const snapshot = text ? snapshotText(text, ref, translation) : '';
    if (snapshot) item.ref = { ...ref, snapshotText: snapshot };
  }
}

self.addEventListener('message', (event: MessageEvent<ImportRequest>) => {
  read(event.data.file).catch((error: unknown) =>
    post({
      type: 'failed',
      format: error instanceof ImportFormatError,
      message: error instanceof Error ? error.message : String(error),
    }),
  );
});
