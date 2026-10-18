import { type OpenInTable, openInTableSchema } from '@lamp/domain';
import { useSyncExternalStore } from 'react';
import bundled from '../../public/open-in.json' with { type: 'json' };

/**
 * The "Open in…" target table (F20, M9-10, TECH-DESIGN §17.11): `/open-in.json`, fetched
 * network-first at each start, so a link format can change by replacing that file, without a
 * release. The last good copy is kept in this browser for offline starts; the copy built into the
 * app is the first. A table that fails to load or doesn't parse leaves the last one in use.
 */

export const OPEN_IN_URL = '/open-in.json';
export const OPEN_IN_STORAGE_KEY = 'lamp.openInTable';

const BUILT_IN: OpenInTable = openInTableSchema.parse(bundled);

function parsed(json: unknown): OpenInTable | null {
  const result = openInTableSchema.safeParse(json);
  return result.success ? result.data : null;
}

function storedTable(): OpenInTable | null {
  try {
    const text = localStorage.getItem(OPEN_IN_STORAGE_KEY);
    return text ? parsed(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

let table: OpenInTable = storedTable() ?? BUILT_IN;
const listeners = new Set<() => void>();
let loading: Promise<void> | undefined;

/** Fetches the newest table, once per start; it's used as soon as it arrives. */
export function loadOpenInTable(): Promise<void> {
  loading ??= (async () => {
    try {
      const response = await fetch(OPEN_IN_URL, { cache: 'no-cache' });
      if (!response.ok) return;
      const fresh = parsed(await response.json());
      if (!fresh) return;
      table = fresh;
      for (const listener of listeners) listener();
      try {
        localStorage.setItem(OPEN_IN_STORAGE_KEY, JSON.stringify(fresh));
      } catch {
        // Not kept: the next offline start uses the copy in the app.
      }
    } catch {
      // Offline, or the file is unreachable: the last table stays.
    }
  })();
  return loading;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useOpenInTable(): OpenInTable {
  return useSyncExternalStore(subscribe, () => table);
}
