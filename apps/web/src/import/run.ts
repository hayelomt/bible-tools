import { useSyncExternalStore } from 'react';
import { importInboxItems, type Imported } from '@/data/actions/inbox.ts';
import type { ImportReply } from './protocol.ts';

/**
 * The YouVersion import in progress (F21, M9-11), one at a time, outside React so it goes on
 * while the user keeps working elsewhere (wireframes/interop.md "YouVersion import"). The worker
 * reads the file; the items are written in one action at the end, so Cancel adds nothing.
 */
export type ImportRun =
  | { status: 'idle' }
  /** Until the file is read and its records counted. */
  | { status: 'reading' }
  | { status: 'running'; done: number; total: number }
  | { status: 'saving'; total: number }
  | { status: 'done'; total: number; result: Imported }
  /** `format`: not an export Lamp can read; nothing was imported either way. */
  | { status: 'failed'; format: boolean };

let run: ImportRun = { status: 'idle' };
let worker: Worker | undefined;
const listeners = new Set<() => void>();
const finishedListeners = new Set<(run: ImportRun) => void>();

function set(next: ImportRun) {
  run = next;
  for (const listener of listeners) listener();
  if (next.status === 'done' || next.status === 'failed') {
    for (const listener of finishedListeners) listener(next);
  }
}

export const importRun = (): ImportRun => run;

/** Starts importing `file`, unless an import is already running. */
export function startImport(file: Blob) {
  if (worker || run.status === 'saving') return;
  set({ status: 'reading' });
  const current = new Worker(new URL('./import.worker.ts', import.meta.url), { type: 'module' });
  worker = current;
  let total = 0;
  const stop = () => {
    current.terminate();
    if (worker === current) worker = undefined;
  };
  current.addEventListener('message', (event: MessageEvent<ImportReply>) => {
    if (worker !== current) return;
    const reply = event.data;
    if (reply.type === 'total') {
      total = reply.total;
      set({ status: 'running', done: 0, total });
    } else if (reply.type === 'progress') {
      set({ status: 'running', done: reply.done, total });
    } else if (reply.type === 'done') {
      stop();
      set({ status: 'saving', total });
      importInboxItems(reply.items).then(
        (result) => set({ status: 'done', total, result }),
        (error: unknown) => {
          console.error('Saving the import failed', error);
          set({ status: 'failed', format: false });
        },
      );
    } else {
      stop();
      if (!reply.format) console.error('Import failed:', reply.message);
      set({ status: 'failed', format: reply.format });
    }
  });
  current.addEventListener('error', (event) => {
    if (worker !== current) return;
    console.error('Import failed:', event.message);
    stop();
    set({ status: 'failed', format: false });
  });
  // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
  current.postMessage({ file });
}

/** Stops an import before it saves: nothing is added. */
export function cancelImport() {
  if (!worker) return;
  worker.terminate();
  worker = undefined;
  set({ status: 'idle' });
}

/** Back to the start, once the result has been seen. */
export function resetImport() {
  if (run.status === 'done' || run.status === 'failed') set({ status: 'idle' });
}

/** Calls `listener` when an import finishes, wherever the user is. */
export function onImportFinished(listener: (run: ImportRun) => void): () => void {
  finishedListeners.add(listener);
  return () => finishedListeners.delete(listener);
}

export function useImportRun(): ImportRun {
  return useSyncExternalStore((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, importRun);
}
