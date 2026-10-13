import type { RowEntity } from './db.ts';

/** A row an action wrote: created, changed, deleted or restored. */
export interface RowRef {
  entity: RowEntity;
  id: string;
}

type Listener = (refs: readonly RowRef[]) => void;
const listeners = new Set<Listener>();

/**
 * Called with the rows each action wrote, once its transaction has committed: what the search
 * index (§8.4) updates from. A pull (M3) reports its rows here too.
 */
export function onRowsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitRowsChanged(refs: readonly RowRef[]): void {
  if (refs.length === 0) return;
  for (const listener of listeners) listener(refs);
}

const writeListeners = new Set<() => void>();

/**
 * Called after each action commits, settings included: a change was queued, so sync runs soon
 * (§6.3). A pull's rows don't count.
 */
export function onLocalWrite(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

export function emitLocalWrite(): void {
  for (const listener of writeListeners) listener();
}
