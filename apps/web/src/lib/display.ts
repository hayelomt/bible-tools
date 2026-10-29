import {
  applyDisplay,
  DEFAULT_DISPLAY,
  type Display,
  DISPLAY_STORAGE_KEY,
  readDisplay,
  saveDisplay,
} from '@lamp/ui/themes/theme';
import { useSyncExternalStore } from 'react';

/**
 * The device's density and text size (§8.5), kept in `localStorage` only: not synced, so a phone
 * and a laptop can differ. The inline script in index.html applies them before the first paint;
 * a change applies at once, and in the device's other tabs through the `storage` event.
 */
const listeners = new Set<() => void>();
let current: Display | undefined;

function stored(): Display {
  try {
    return readDisplay(localStorage);
  } catch {
    // Storage blocked: the defaults.
    return DEFAULT_DISPLAY;
  }
}

function snapshot(): Display {
  current ??= stored();
  return current;
}

function changed(display: Display): void {
  current = display;
  applyDisplay(document.documentElement, display);
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent): void {
  if (event.key === DISPLAY_STORAGE_KEY) changed(stored());
}

function subscribe(onChange: () => void): () => void {
  if (listeners.size === 0) addEventListener('storage', onStorage);
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) removeEventListener('storage', onStorage);
  };
}

export function useDisplay(): Display {
  return useSyncExternalStore(subscribe, snapshot);
}

export function setDisplay(change: Partial<Display>): void {
  const display = { ...snapshot(), ...change };
  try {
    saveDisplay(localStorage, display);
  } catch {
    // Not remembered: it still applies until the page is reloaded.
  }
  changed(display);
}

/** Keeps the page in step with a change made in another tab, while the shell is mounted. */
export function useDisplaySync(): void {
  useDisplay();
}
