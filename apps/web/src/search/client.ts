import { useSyncExternalStore } from 'react';
import { onRowsChanged } from '@/data/changes.ts';
import type { WorkerReply, WorkerRequest } from './protocol.ts';
import type { TextHit } from './text-index.ts';

/** `building` until the worker has read every note; `failed` if it couldn't. */
export type IndexStatus = 'off' | 'building' | 'ready' | 'failed';

/** The mark the index sets when it's ready, with how long it took (the M4-05 target is 1 s). */
export const READY_MARK = 'lamp:search-ready';

let worker: Worker | undefined;
let status: IndexStatus = 'off';
const statusListeners = new Set<() => void>();
let nextId = 0;
const pending = new Map<
  number,
  { resolve: (hits: TextHit[]) => void; reject: (e: Error) => void }
>();
let readyWaiters: Array<() => void> = [];

function setStatus(next: IndexStatus) {
  status = next;
  for (const listener of statusListeners) listener();
  if (next === 'ready' || next === 'failed') {
    for (const wake of readyWaiters) wake();
    readyWaiters = [];
  }
}

// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
const send = (request: WorkerRequest) => worker?.postMessage(request);

/**
 * Starts the free text index (TECH-DESIGN §8.4): a Web Worker that reads every note once, then
 * keeps up with each action as it commits.
 */
export function startSearchIndex() {
  if (worker) return;
  const started = performance.now();
  worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
  setStatus('building');
  onRowsChanged((refs) => send({ type: 'changed', refs }));
  worker.addEventListener('message', (event: MessageEvent<WorkerReply>) => {
    const reply = event.data;
    if (reply.type === 'ready') {
      // From starting the worker, so loading its script counts too.
      performance.mark(READY_MARK, {
        detail: { ms: performance.now() - started, buildMs: reply.buildMs, docs: reply.docs },
      });
      setStatus('ready');
    } else if (reply.type === 'results') {
      pending.get(reply.id)?.resolve(reply.hits);
      pending.delete(reply.id);
    } else if (reply.id === undefined) {
      if (status === 'building') setStatus('failed');
      console.error('Search index:', reply.message);
    } else {
      pending.get(reply.id)?.reject(new Error(reply.message));
      pending.delete(reply.id);
    }
  });
  worker.addEventListener('error', (event) => {
    console.error('Search index:', event.message);
    setStatus('failed');
  });
}

/**
 * Free text matches, best first, once the index is ready. A search screen opened straight from
 * its address can ask before the index has started, so that waits too.
 */
export async function searchText(query: string): Promise<TextHit[]> {
  if (status === 'off' || status === 'building') {
    await new Promise<void>((wake) => readyWaiters.push(wake));
  }
  if (status !== 'ready') throw new Error('The search index is not available.');
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'search', id, query });
  });
}

function subscribe(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** Whether the index is ready now, for a caller that won't wait for it. */
export function indexStatus(): IndexStatus {
  return status;
}

export function useIndexStatus(): IndexStatus {
  return useSyncExternalStore(subscribe, () => status);
}
