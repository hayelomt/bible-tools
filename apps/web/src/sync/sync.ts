import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { db } from '@/data/db.ts';
import { refreshAccount, useAccount } from '@/lib/account.ts';
import { CLIENT_VERSION, pullChanges, pushChanges } from '@/lib/api.ts';
import { deviceName } from './device-name.ts';
import { SyncEngine, type SyncStatus } from './engine.ts';

/** The app's sync engine, started with the background work once the device is set up. */
export const syncEngine = new SyncEngine({
  db,
  api: { push: pushChanges, pull: pullChanges },
  deviceName: deviceName(navigator.userAgent),
  clientVersion: CLIENT_VERSION,
});

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(syncEngine.subscribe, syncEngine.getStatus);
}

/** Tells the engine who is signed in, and asks the server again when a sync gets a `401`. */
export function useSyncAccount(): void {
  const account = useAccount();
  const queryClient = useQueryClient();
  useEffect(() => {
    syncEngine.onUnauthorized = () => void refreshAccount(queryClient);
  }, [queryClient]);
  useEffect(() => {
    syncEngine.setAccount(account.data ?? null);
  }, [account.data]);
}
