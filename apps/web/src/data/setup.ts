import { DEFAULT_TRANSLATION, newId, SEED_TAGS, type UserSettings } from '@lamp/domain';
import { action } from './action.ts';
import { type LampDb, SETTINGS_KEY, SYNC_STATE_KEY } from './db.ts';

export type InitialSettings = Pick<UserSettings, 'themePreset' | 'colorMode' | 'look'>;

export const DEFAULT_REVIEW_WINDOW_DAYS = 14;

/**
 * First run on this device: gives it an id, default settings and the 24 seeded tags (§4.3). Safe
 * to call on every start and from several tabs at once; only the first call writes anything.
 *
 * The seeded tags go into the outbox, since sections and lessons will link to them. The default
 * settings don't: they stay at rev 0 until the user changes one, so signing in later takes the
 * account's settings instead of overwriting them with this device's defaults.
 */
export function ensureDevice(db: LampDb, initial: InitialSettings): Promise<void> {
  return db.transaction('rw', db.tables, async () => {
    if (await db.syncState.get(SYNC_STATE_KEY)) return;
    await db.syncState.put(
      {
        deviceId: newId(),
        cursor: 0,
        lastPushAt: null,
        lastPullAt: null,
        clockOffsetMs: 0,
        ownerUserId: null,
        ownerEmail: null,
      },
      SYNC_STATE_KEY,
    );
    await action(db, async (w) => {
      await db.userSettings.put(
        {
          ...initial,
          defaultTranslation: DEFAULT_TRANSLATION,
          reviewWindowDays: DEFAULT_REVIEW_WINDOW_DAYS,
          autoPreviewVerses: false,
          rev: 0,
          updatedAt: w.now,
        },
        SETTINGS_KEY,
      );
      for (const name of SEED_TAGS) await w.create('tag', { name, isSeeded: true });
    });
  });
}
