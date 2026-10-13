import { useEffect, useState } from 'react';

/**
 * Asks the browser to keep this site's data when space runs low (TECH-DESIGN §8.6), once there's
 * something worth keeping: after the first lesson (and, from M3-05, after sign-in). Chromium
 * decides by itself; Firefox asks the user once.
 */
export async function requestPersistence(): Promise<void> {
  try {
    if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
    await navigator.storage.persist();
  } catch (error) {
    console.error('Asking to keep storage failed', error);
  }
}

export interface StorageUse {
  /** Bytes this site stores (notes, the Bible text, the app). */
  usage: number;
  /** The browser has agreed to keep it. */
  persisted: boolean;
}

/** What the site stores and whether it's kept, for settings; null where the browser doesn't say. */
export function useStorageUse(): StorageUse | null {
  const [use, setUse] = useState<StorageUse | null>(null);
  useEffect(() => {
    let live = true;
    void (async () => {
      if (!navigator.storage?.estimate) return;
      const [{ usage = 0 }, persisted] = await Promise.all([
        navigator.storage.estimate(),
        navigator.storage.persisted?.() ?? false,
      ]);
      if (live) setUse({ usage, persisted });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return use;
}

/** "4.1 MB". */
export function formatBytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}
