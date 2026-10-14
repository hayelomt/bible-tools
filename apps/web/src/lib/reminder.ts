import { REMINDER_INTERVAL_MS, REMINDER_TAG } from '@/data/reminder.ts';

/**
 * The weekly reminder's switch (wireframes/review.md "Weekly reminder"). Per device: the browser
 * keeps the registration and the permission, so nothing is stored or synced. Only Chromium, for
 * an installed app, has Periodic Background Sync; anywhere else the Review tab's count stands in.
 */

/** Periodic Background Sync, which TypeScript's lib leaves out. */
interface PeriodicSyncManager {
  register: (tag: string, options?: { minInterval: number }) => Promise<void>;
  unregister: (tag: string) => Promise<void>;
  getTags: () => Promise<string[]>;
}

async function periodicSync(): Promise<PeriodicSyncManager | null> {
  if (!('Notification' in window)) return null;
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  const manager = (registration as { periodicSync?: PeriodicSyncManager } | undefined)
    ?.periodicSync;
  if (!manager) return null;
  // Granted only to an installed app (and the browser's own engagement rules).
  const permission = await navigator.permissions
    .query({ name: 'periodic-background-sync' as PermissionName })
    .catch(() => null);
  return permission?.state === 'granted' ? manager : null;
}

export type ReminderState =
  /** This browser can't remind; the count shows instead. */
  | 'unsupported'
  | 'off'
  | 'on'
  /** Turned on here, but notifications are blocked for the site. */
  | 'blocked';

/** Whether notifications are allowed, asked, or not yet asked for. */
async function notifications(): Promise<PermissionState> {
  const status = await navigator.permissions.query({ name: 'notifications' }).catch(() => null);
  return status?.state ?? 'prompt';
}

export async function reminderState(): Promise<ReminderState> {
  const manager = await periodicSync();
  if (!manager) return 'unsupported';
  const on = (await manager.getTags()).includes(REMINDER_TAG);
  if (!on) return 'off';
  return (await notifications()) === 'denied' ? 'blocked' : 'on';
}

/** Turns the reminder on, asking for notifications first, or off. Gives back the new state. */
export async function setReminder(on: boolean): Promise<ReminderState> {
  const manager = await periodicSync();
  if (!manager) return 'unsupported';
  if (!on) {
    await manager.unregister(REMINDER_TAG);
    return 'off';
  }
  let permission = await notifications();
  if (permission === 'prompt') {
    const answer = await Notification.requestPermission();
    permission = answer === 'default' ? 'prompt' : answer;
  }
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  await manager.register(REMINDER_TAG, { minInterval: REMINDER_INTERVAL_MS });
  return 'on';
}

/** The installed app's icon shows the Review tab's count, where the browser can (Badging API). */
export function setAppBadge(count: number): void {
  if (!('setAppBadge' in navigator)) return;
  const done = count > 0 ? navigator.setAppBadge(count) : navigator.clearAppBadge();
  done.catch(() => {});
}
