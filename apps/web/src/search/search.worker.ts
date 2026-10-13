/// <reference lib="webworker" />
import { db } from '@/data/db.ts';
import type { RowRef } from '@/data/changes.ts';
import type { WorkerReply, WorkerRequest } from './protocol.ts';
import { allDocs, changedDocs } from './read-docs.ts';
import { TextIndex } from './text-index.ts';

/**
 * The free text index (TECH-DESIGN §8.4), off the main thread. It reads the device's database
 * itself: all of it at start, then the rows each action reports. Work runs in order, so a search
 * sent after a change sees it.
 */
declare const self: DedicatedWorkerGlobalScope;

const index = new TextIndex();
let queue: Promise<unknown> = Promise.resolve();
// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
const post = (reply: WorkerReply) => self.postMessage(reply);

function enqueue(work: () => Promise<void> | void) {
  queue = queue
    .then(work)
    .catch((error: unknown) => post({ type: 'failed', message: String(error) }));
}

async function build() {
  const started = performance.now();
  index.addAll(await allDocs(db));
  post({ type: 'ready', buildMs: performance.now() - started, docs: index.size });
}

async function update(refs: readonly RowRef[]) {
  for (const [id, doc] of await changedDocs(refs, db)) index.set(id, doc);
}

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'changed') {
    enqueue(() => update(request.refs));
  } else {
    enqueue(() => {
      try {
        post({ type: 'results', id: request.id, hits: index.search(request.query) });
      } catch (error) {
        post({ type: 'failed', id: request.id, message: String(error) });
      }
    });
  }
});

enqueue(build);
