import type { OpenInTarget, UserSettings } from '@lamp/domain';
import { action, RowNotFoundError, type SettingsPatch } from '../action.ts';
import { db as appDb, type LampDb, SETTINGS_KEY } from '../db.ts';

/** Changes the user's settings; they sync like any other row. */
export function updateSettings(patch: SettingsPatch, db: LampDb = appDb): Promise<UserSettings> {
  return action(db, (w) => w.updateSettings(patch));
}

/**
 * Changes the "Open in…" targets from the stored list, so quick changes in a row (switches
 * tapped one after another) each build on the last.
 */
export function changeOpenInTargets(
  change: (shown: readonly OpenInTarget[]) => OpenInTarget[],
  db: LampDb = appDb,
): Promise<UserSettings> {
  return action(db, async (w) => {
    const current = await w.db.userSettings.get(SETTINGS_KEY);
    if (!current) throw new RowNotFoundError('userSettings', SETTINGS_KEY);
    return w.updateSettings({ openInTargets: change(current.openInTargets) });
  });
}
