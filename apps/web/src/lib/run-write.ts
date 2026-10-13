import { RowNotFoundError } from '@/data/action.ts';

/**
 * A write started from a click or a key, not awaited. A row deleted meanwhile (its lesson, from
 * another tab) has nothing left to save; anything else is logged until the storage-full toast
 * (states.md) reports it.
 */
export function runWrite(write: Promise<unknown>, what: string): void {
  write.catch((error: unknown) => reportWriteError(error, what));
}

export function reportWriteError(error: unknown, what: string): void {
  if (error instanceof RowNotFoundError) return;
  console.error(`Saving ${what} failed`, error);
}
