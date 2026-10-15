import { DEFAULT_TRANSLATION, type TranslationId } from '@lamp/domain';
import { liveQuery } from 'dexie';
import { useSyncExternalStore } from 'react';
import { db, SETTINGS_KEY } from './db.ts';

/**
 * The translation the app reads (F8) and quotes in new chips and highlights: the user's choice in
 * settings (`defaultTranslation`, synced), followed live once background work starts, and
 * `DEFAULT_TRANSLATION` until then. A chip keeps the translation it was captured from.
 */
let active: TranslationId = DEFAULT_TRANSLATION;
const listeners = new Set<(translation: TranslationId) => void>();

export function activeTranslation(): TranslationId {
  return active;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Calls `listener` with the active translation now and each time it changes. */
export function onActiveTranslation(listener: (translation: TranslationId) => void): () => void {
  listener(active);
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setActiveTranslation(translation: TranslationId) {
  if (translation === active) return;
  active = translation;
  for (const listener of listeners) listener(translation);
}

/**
 * Follows the settings row, so a change here or from another device applies at once. Resolves once
 * the row has been read.
 */
export function followSettings(): Promise<void> {
  return new Promise((resolve) => {
    liveQuery(() => db.userSettings.get(SETTINGS_KEY)).subscribe({
      next: (settings) => {
        setActiveTranslation(settings?.defaultTranslation ?? DEFAULT_TRANSLATION);
        resolve();
      },
      error: (error: unknown) => {
        console.error('Reading the translation setting failed', error);
        resolve();
      },
    });
  });
}

/** The active translation, re-rendering when it changes. */
export function useActiveTranslation(): TranslationId {
  return useSyncExternalStore(subscribe, activeTranslation);
}
