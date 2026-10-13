import { count } from '@/lib/labels.ts';
import type { SyncStatus } from './engine.ts';

/** Retries failing for longer than this are a problem the user is told about (wireframes/sync.md). */
export const PROBLEM_AFTER_MS = 10 * 60_000;
/** A clock further off than this gets a warning (§6.5). */
export const CLOCK_WARNING_MS = 5 * 60_000;
/** A sync shorter than this never shows "Syncing…", so quick syncs don't flicker. */
export const SYNCING_DELAY_MS = 1000;

/**
 * What the sync status says (wireframes/sync.md), from the engine's phase and what the device
 * knows. `paused` is the moment the "notes from another account" dialog is open.
 */
export type SyncView =
  | 'guest'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'verify'
  | 'signed-out'
  | 'update'
  | 'problem'
  | 'paused';

export interface SyncViewInput {
  status: Pick<SyncStatus, 'phase' | 'failingSince'>;
  signedIn: boolean;
  /** Whether the browser thinks it has a connection. */
  online: boolean;
  /** Changes the server refused, waiting in the outbox. */
  rejected: number;
  now: number;
}

/**
 * The state shown. Anything the user must act on comes first; offline beats syncing, as nothing
 * gets through without a connection. A failing server is only a problem after 10 minutes; until
 * then it's retrying, which is syncing as far as the user can tell.
 */
export function syncView({ status, signedIn, online, rejected, now }: SyncViewInput): SyncView {
  switch (status.phase) {
    case 'update-required':
      return 'update';
    case 'signed-out':
      return 'signed-out';
    case 'unverified':
      return 'verify';
    case 'other-account':
      return 'paused';
    case 'guest':
      // Before the engine's first run, a signed-in device is about to sync.
      if (!signedIn) return 'guest';
      break;
    default:
      break;
  }
  if (rejected > 0) return 'problem';
  const failingFor = status.failingSince ? now - Date.parse(status.failingSince) : 0;
  if (status.phase === 'failing' && failingFor > PROBLEM_AFTER_MS) return 'problem';
  if (status.phase === 'offline' || !online) return 'offline';
  if (status.phase === 'synced') return 'synced';
  return 'syncing';
}

/** How the status line looks: quiet, fine, or asking the user to act (the only destructive one). */
export type Tone = 'quiet' | 'ok' | 'act';

/** The status line's words and tone for a state; `waiting` is the outbox's rows. */
export function indicator(view: SyncView, waiting: number): { text: string; tone: Tone } {
  switch (view) {
    case 'guest':
      return { text: 'On this device', tone: 'quiet' };
    case 'synced':
      return { text: 'Synced', tone: 'ok' };
    case 'syncing':
      return { text: 'Syncing…', tone: 'quiet' };
    case 'offline':
      return { text: waiting > 0 ? `Offline · ${waiting} waiting` : 'Offline', tone: 'quiet' };
    case 'verify':
      return { text: 'Verify your email', tone: 'act' };
    case 'signed-out':
      return { text: 'Sign in to sync', tone: 'act' };
    case 'update':
      return { text: 'Update Lamp', tone: 'act' };
    case 'problem':
      return { text: 'Sync problem', tone: 'act' };
    case 'paused':
      return { text: 'Not synced', tone: 'quiet' };
  }
}

/** "This device's clock is 12 minutes off", or null within 5 minutes of the server's (§6.5). */
export function clockWarning(offsetMs: number): string | null {
  const off = Math.abs(offsetMs);
  if (off <= CLOCK_WARNING_MS) return null;
  const minutes = Math.round(off / 60_000);
  const amount = minutes < 120 ? count(minutes, 'minute') : count(Math.round(minutes / 60), 'hour');
  return `This device's clock is ${amount} off. Set it to automatic so the newest edits win.`;
}
