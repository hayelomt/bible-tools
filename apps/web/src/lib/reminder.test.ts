import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { REMINDER_INTERVAL_MS, REMINDER_TAG } from '@/data/reminder.ts';
import { reminderState, setReminder } from './reminder.ts';

/** A browser as the test sets it up: its permissions, and the periodic syncs registered. */
let periodic: PermissionState;
let notifications: PermissionState;
let answer: NotificationPermission;
let tags: string[];
const register = vi.fn<(tag: string, options?: { minInterval: number }) => Promise<void>>((tag) => {
  tags.push(tag);
  return Promise.resolve();
});

beforeEach(() => {
  periodic = 'granted';
  notifications = 'prompt';
  answer = 'granted';
  tags = [];
  register.mockClear();
  const periodicSync = {
    register,
    unregister: (tag: string) => {
      tags = tags.filter((t) => t !== tag);
      return Promise.resolve();
    },
    getTags: () => Promise.resolve([...tags]),
  };
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: () => Promise.resolve({ periodicSync }) },
    permissions: {
      query: ({ name }: { name: string }) =>
        Promise.resolve({ state: name === 'notifications' ? notifications : periodic }),
    },
  });
  vi.stubGlobal('Notification', {
    requestPermission: () => {
      if (answer !== 'default') notifications = answer === 'granted' ? 'granted' : 'denied';
      return Promise.resolve(answer);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the weekly reminder switch', () => {
  it('is unsupported without Periodic Background Sync for the site (an app not installed)', async () => {
    periodic = 'prompt';
    expect(await reminderState()).toBe('unsupported');
    expect(await setReminder(true)).toBe('unsupported');
    expect(register).not.toHaveBeenCalled();
  });

  it('asks for notifications, then registers once a week; off unregisters', async () => {
    expect(await reminderState()).toBe('off');
    expect(await setReminder(true)).toBe('on');
    expect(register).toHaveBeenCalledWith(REMINDER_TAG, { minInterval: REMINDER_INTERVAL_MS });
    expect(await reminderState()).toBe('on');
    expect(await setReminder(false)).toBe('off');
    expect(await reminderState()).toBe('off');
  });

  it('stays off when notifications are refused or the question is put off', async () => {
    answer = 'default';
    expect(await setReminder(true)).toBe('off');
    answer = 'denied';
    expect(await setReminder(true)).toBe('blocked');
    expect(register).not.toHaveBeenCalled();
    expect(await reminderState()).toBe('off');
  });

  it('shows as blocked when notifications were blocked after it was turned on', async () => {
    expect(await setReminder(true)).toBe('on');
    notifications = 'denied';
    expect(await reminderState()).toBe('blocked');
  });
});
