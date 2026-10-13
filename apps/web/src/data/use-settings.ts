import type { UserSettings } from '@lamp/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, SETTINGS_KEY } from './db.ts';

/** The user's settings, live; undefined only for the moment before the first read. */
export function useSettings(): UserSettings | undefined {
  return useLiveQuery(() => db.userSettings.get(SETTINGS_KEY), []);
}
