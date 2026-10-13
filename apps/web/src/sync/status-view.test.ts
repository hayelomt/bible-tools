import { describe, expect, it } from 'vitest';
import type { SyncPhase } from './engine.ts';
import {
  clockWarning,
  indicator,
  PROBLEM_AFTER_MS,
  type SyncView,
  syncView,
  type SyncViewInput,
} from './status-view.ts';

const NOW = Date.parse('2026-10-13T09:41:00Z');

const since = (ms: number) => new Date(NOW - ms).toISOString();

const view = (phase: SyncPhase, input: Partial<SyncViewInput> = {}) =>
  syncView({
    status: { phase, failingSince: null },
    signedIn: true,
    online: true,
    rejected: 0,
    now: NOW,
    ...input,
  });

describe('sync status (wireframes/sync.md)', () => {
  it('shows each phase as its state', () => {
    expect(view('guest', { signedIn: false })).toBe('guest');
    expect(view('synced')).toBe('synced');
    expect(view('syncing')).toBe('syncing');
    expect(view('offline')).toBe('offline');
    expect(view('unverified')).toBe('verify');
    expect(view('signed-out', { signedIn: false })).toBe('signed-out');
    expect(view('update-required')).toBe('update');
    expect(view('other-account')).toBe('paused');
  });

  it('is syncing, not a guest, before the first run for a signed-in device', () => {
    expect(view('guest')).toBe('syncing');
  });

  it('is offline when the browser says so, even mid-sync', () => {
    expect(view('synced', { online: false })).toBe('offline');
    expect(view('syncing', { online: false })).toBe('offline');
  });

  it('is a problem with a refused change, or after 10 minutes of failures', () => {
    expect(view('synced', { rejected: 1 })).toBe('problem');
    expect(view('offline', { rejected: 1 })).toBe('problem');
    const failing = (ms: number) =>
      view('failing', { status: { phase: 'failing', failingSince: since(ms) } });
    expect(failing(PROBLEM_AFTER_MS - 1000)).toBe('syncing');
    expect(failing(PROBLEM_AFTER_MS + 1000)).toBe('problem');
    // Offline for long is still only offline: nothing is wrong with the server.
    expect(view('offline', { status: { phase: 'offline', failingSince: since(3_600_000) } })).toBe(
      'offline',
    );
  });

  it('asks the user to act before anything else', () => {
    expect(view('update-required', { rejected: 2, online: false })).toBe('update');
    expect(view('unverified', { online: false })).toBe('verify');
  });

  it('words each state, quietly unless the user has to act', () => {
    const all: Array<[SyncView, string, string]> = [
      ['guest', 'On this device', 'quiet'],
      ['synced', 'Synced', 'ok'],
      ['syncing', 'Syncing…', 'quiet'],
      ['offline', 'Offline · 3 waiting', 'quiet'],
      ['verify', 'Verify your email', 'act'],
      ['signed-out', 'Sign in to sync', 'act'],
      ['update', 'Update Lamp', 'act'],
      ['problem', 'Sync problem', 'act'],
      ['paused', 'Not synced', 'quiet'],
    ];
    for (const [state, text, tone] of all) {
      expect(indicator(state, 3)).toEqual({ text, tone });
    }
    expect(indicator('offline', 0).text).toBe('Offline');
  });

  it('warns about a clock more than 5 minutes off, either way', () => {
    expect(clockWarning(4 * 60_000)).toBeNull();
    expect(clockWarning(-12 * 60_000)).toBe(
      "This device's clock is 12 minutes off. Set it to automatic so the newest edits win.",
    );
    expect(clockWarning(3 * 3_600_000)).toContain('3 hours off');
  });
});
