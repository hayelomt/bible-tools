import type { UserSettings } from '@lamp/domain';
import { action, type SettingsPatch } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/** Changes the user's settings; they sync like any other row. */
export function updateSettings(patch: SettingsPatch, db: LampDb = appDb): Promise<UserSettings> {
  return action(db, (w) => w.updateSettings(patch));
}
