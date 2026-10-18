import type { VerseTextMatch } from '@lamp/bible-data';
import type { Passage } from '@lamp/domain';
import { useSyncExternalStore } from 'react';
import { onBookArrived } from '@/data/bible.ts';
import type { MatcherReply, MatcherRequest } from './protocol.ts';

/** `building` until every book on the device is indexed; `failed` if it couldn't be. */
export type MatcherStatus = 'off' | 'building' | 'ready' | 'failed';

/** The mark set when the matcher is ready, with how long it took and how much it holds. */
export const MATCHER_READY_MARK = 'lamp:verse-match-ready';

let worker: Worker | undefined;
let status: MatcherStatus = 'off';
const statusListeners = new Set<() => void>();
let nextId = 0;
const pending = new Map<number, (matches: VerseTextMatch[]) => void>();
let readyWaiters: Array<() => void> = [];

function setStatus(next: MatcherStatus) {
  status = next;
  for (const listener of statusListeners) listener();
  if (next === 'ready' || next === 'failed') {
    for (const wake of readyWaiters) wake();
    readyWaiters = [];
  }
}

// oxlint-disable-next-line unicorn/require-post-message-target-origin -- a worker's port has no origin
const send = (request: MatcherRequest) => worker?.postMessage(request);

/**
 * Starts the verse-text matcher (M9-04), the first time anything needs it: the Inbox and the share
 * screen start it as they open, so it's usually ready by the time text is pasted (decided
 * 2026-10-18). Other screens never pay for its memory.
 */
export function startVerseMatcher() {
  if (worker) return;
  const started = performance.now();
  worker = new Worker(new URL('./verse-match.worker.ts', import.meta.url), { type: 'module' });
  setStatus('building');
  onBookArrived((translation, code) => send({ type: 'book', translation, code }));
  worker.addEventListener('message', (event: MessageEvent<MatcherReply>) => {
    const reply = event.data;
    if (reply.type === 'ready') {
      const { type: _, ...detail } = reply;
      performance.mark(MATCHER_READY_MARK, {
        detail: { ms: performance.now() - started, ...detail },
      });
      setStatus('ready');
    } else if (reply.type === 'results') {
      pending.get(reply.id)?.(reply.matches);
      pending.delete(reply.id);
    } else {
      console.error('Verse matcher:', reply.message);
      if (reply.id === undefined && status === 'building') setStatus('failed');
      if (reply.id !== undefined) pending.get(reply.id)?.([]);
      pending.delete(reply.id ?? -1);
    }
  });
  worker.addEventListener('error', (event) => {
    console.error('Verse matcher:', event.message);
    setStatus('failed');
  });
}

/**
 * Whole BSB and KJV verses in `text` (F19), once the matcher is ready; none if it can't be built,
 * since a paste or a share works without it. `hints` are the references found in the text, which
 * decide between two passages with the same words.
 */
export async function matchVerseText(
  text: string,
  hints: readonly Passage[] = [],
): Promise<VerseTextMatch[]> {
  startVerseMatcher();
  if (status === 'building') await new Promise<void>((wake) => readyWaiters.push(wake));
  if (status !== 'ready') return [];
  const id = ++nextId;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ type: 'match', id, text, hints: [...hints] });
  });
}

function subscribe(listener: () => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

export function useMatcherStatus(): MatcherStatus {
  return useSyncExternalStore(subscribe, () => status);
}
