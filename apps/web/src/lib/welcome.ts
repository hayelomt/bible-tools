import { useSyncExternalStore } from 'react';

/** Set once the first-run welcome is done on this device (wireframes/lessons.md "First run"). */
export const WELCOMED_KEY = 'lamp.welcomed';

const listeners = new Set<() => void>();

/** Whether this device has been through the welcome, re-rendering when it is. */
export function useWelcomed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => localStorage.getItem(WELCOMED_KEY) !== null,
  );
}

export function finishWelcome(): void {
  localStorage.setItem(WELCOMED_KEY, new Date().toISOString());
  for (const listener of listeners) listener();
}
