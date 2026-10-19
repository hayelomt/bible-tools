/// <reference lib="webworker" />
import type { ImportReply, ImportRequest } from './protocol.ts';
import { exportRecords, type ImportedItem, ImportFormatError, recordItems } from './youversion.ts';

/**
 * The YouVersion import (F21, M9-11), off the main thread: reads the export file, turns each
 * highlight and note into inbox items with progress as it goes. The page writes the items in one action, so a cancelled import adds nothing.
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
  post({ type: 'progress', done: records.length });
  post({ type: 'done', items });
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
