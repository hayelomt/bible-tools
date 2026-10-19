import type {
  MeResponse,
  PulledGroup,
  PullResponse,
  PushRequest,
  PushResponse,
} from '@lamp/domain';
import { onLocalWrite } from '@/data/changes.ts';
import { type LampDb, SYNC_STATE_KEY } from '@/data/db.ts';
import { ApiRequestError, NetworkError } from '@/lib/api.ts';
import { copyNotes, removeNotes } from './device-data.ts';
import { settleBatch, takeBatch, toChange } from './outbox.ts';
import { type PullGroup, syncGroups } from './groups.ts';
import { applyPage, clockOffset } from './pull.ts';
import { matchTagsByName } from './tags.ts';

/**
 * Where sync stands (wireframes/sync.md). The status line and panel (M3-11) show it.
 * - `guest`: no account and never signed in; nothing is backed up.
 * - `synced`: the last sync went through.
 * - `syncing`: a push or pull is running.
 * - `offline`: the server can't be reached; changes wait.
 * - `unverified`: signed up, email not verified yet; nothing syncs.
 * - `signed-out`: the session ended; changes wait until this account signs in again.
 * - `update-required`: the server needs a newer app (`426`); nothing syncs until reload.
 * - `other-account`: the device's notes belong to another account; the user chooses what happens to
 *   them (`resolveOtherAccount`) before anything syncs.
 * - `failing`: the server answered with an error; retrying.
 */
export type SyncPhase =
  | 'guest'
  | 'synced'
  | 'syncing'
  | 'offline'
  | 'unverified'
  | 'signed-out'
  | 'update-required'
  | 'other-account'
  | 'failing';

export interface SyncStatus {
  phase: SyncPhase;
  /** While a pull runs: rows stored of the rows the server had after the cursor. */
  progress: { done: number; total: number; firstSync: boolean } | null;
  /** When a sync last went through. */
  lastSyncAt: string | null;
  /** When the current run of failures began; null once a sync goes through. */
  failingSince: string | null;
}

export interface SyncApi {
  push(body: PushRequest): Promise<PushResponse>;
  pull(cursor: number, device: { deviceId: string; deviceName: string }): Promise<PullResponse>;
  /** A group's feed (§17.12). */
  pullGroup: PullGroup;
}

export interface SyncDeps {
  db: LampDb;
  api: SyncApi;
  deviceName: string;
  clientVersion: string;
}

/** Retries after a failure wait 5 s, doubling up to 5 min (§6.3). */
export const BACKOFF_MS = { first: 5000, max: 300_000 };
/** A local write is pushed once writes stop for this long. */
export const WRITE_DEBOUNCE_MS = 2000;
/** While the app is visible, it syncs this often. */
export const INTERVAL_MS = 60_000;

/** One sync at a time across tabs: they share the database, so a second run finds little to do. */
const LOCK_NAME = 'lamp-sync';

/** What happens to another account's notes on this device (§6.6). */
export type OtherAccountChoice = 'remove' | 'add';

/**
 * The client sync engine (TECH-DESIGN §6.1–6.6). Each run pushes the outbox in batches, then
 * pulls pages until the server has nothing newer. A device that has never pulled pulls first, so
 * its tags can be matched to the account's by name before they're pushed. It runs on start, when the device comes online,
 * 2 s after the last local write, every 60 s while visible, on "Sync now" and when the account
 * changes. Failures retry with backoff; while one waits, only coming online and "Sync now" run
 * early. Runs never overlap: a trigger during a run asks for one more run after it.
 */
export class SyncEngine {
  private account: MeResponse | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private failures = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private writeTimer: ReturnType<typeof setTimeout> | undefined;
  private blocked = false;
  private status: SyncStatus = {
    phase: 'guest',
    progress: null,
    lastSyncAt: null,
    failingSince: null,
  };
  private readonly listeners = new Set<() => void>();
  private readonly stops: Array<() => void> = [];
  /** Asks the server who is signed in again, after a `401`. Set by the app's shell. */
  onUnauthorized: (() => void) | undefined;

  constructor(private readonly deps: SyncDeps) {}

  /** Starts the triggers and runs once. */
  start(): void {
    if (this.stops.length > 0) return;
    const online = () => void this.syncNow();
    globalThis.addEventListener?.('online', online);
    this.stops.push(() => globalThis.removeEventListener?.('online', online));
    this.stops.push(
      onLocalWrite(() => {
        clearTimeout(this.writeTimer);
        this.writeTimer = setTimeout(() => void this.trigger(), WRITE_DEBOUNCE_MS);
      }),
    );
    const interval = setInterval(() => {
      if (globalThis.document?.visibilityState !== 'hidden') void this.trigger();
    }, INTERVAL_MS);
    this.stops.push(() => clearInterval(interval));
    void this.trigger();
  }

  /** Stops the triggers and any retry waiting (tests, and a device being wiped). */
  stop(): void {
    for (const stop of this.stops.splice(0)) stop();
    clearTimeout(this.writeTimer);
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
  }

  /** The signed-in account, or null. A change of account or of its verification syncs at once. */
  setAccount(account: MeResponse | null): void {
    const before = this.account;
    this.account = account;
    if (before?.id === account?.id && before?.emailVerifiedAt === account?.emailVerifiedAt) return;
    if (this.stops.length > 0) void this.syncNow();
  }

  /** "Sync now", and coming online: runs at once, even while a retry waits. */
  syncNow(): Promise<void> {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    return this.run();
  }

  /**
   * The answer to "This device has notes from another account": remove them, or copy them into
   * the signed-in account. Then syncs.
   */
  async resolveOtherAccount(choice: OtherAccountChoice): Promise<void> {
    const { db } = this.deps;
    const account = this.account;
    if (!account) return;
    await this.settled();
    await withLock(async () => {
      const state = await db.syncState.get(SYNC_STATE_KEY);
      if (!state?.ownerUserId || state.ownerUserId === account.id) return;
      const owner = { id: account.id, email: account.email };
      await (choice === 'add' ? copyNotes(db, owner) : removeNotes(db, owner));
    });
    await this.syncNow();
  }

  /** Resolves once no sync is running, e.g. before the page reloads for an update. */
  settled(): Promise<void> {
    return this.running ?? Promise.resolve();
  }

  getStatus = (): SyncStatus => this.status;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** A timer's trigger, which waits for a retry that's already scheduled. */
  private trigger(): Promise<void> {
    return this.retryTimer ? Promise.resolve() : this.run();
  }

  private run(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      do {
        this.again = false;
        await withLock(() => this.syncOnce());
      } while (this.again);
    })().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async syncOnce(): Promise<void> {
    const { db } = this.deps;
    const account = this.account;
    if (this.blocked) return;
    if (!account) {
      const state = await db.syncState.get(SYNC_STATE_KEY);
      return this.set({ phase: state?.ownerUserId ? 'signed-out' : 'guest', progress: null });
    }
    if (!account.emailVerifiedAt) return this.set({ phase: 'unverified', progress: null });
    if (!(await claimDevice(db, account))) {
      return this.set({ phase: 'other-account', progress: null });
    }
    this.set({ phase: 'syncing' });
    try {
      if ((await db.syncState.get(SYNC_STATE_KEY))?.cursor === 0) await this.pullAll();
      await matchTagsByName(db);
      await this.pushAll();
      const groups = await this.pullAll();
      // Then the groups the user is in, and those they've left (§17.12).
      const { api } = this.deps;
      if (groups) await syncGroups(db, groups, (id, cursor) => api.pullGroup(id, cursor));
      this.failures = 0;
      this.set({
        phase: 'synced',
        progress: null,
        lastSyncAt: new Date().toISOString(),
        failingSince: null,
      });
    } catch (error) {
      this.failed(error);
    }
  }

  /** Pushes until nothing is left to send (rejected changes and those behind them stay). */
  private async pushAll(): Promise<void> {
    const { db, api, deviceName, clientVersion } = this.deps;
    const state = await db.syncState.get(SYNC_STATE_KEY);
    if (!state) return;
    for (;;) {
      const batch = await takeBatch(db);
      if (batch.length === 0) return;
      const { results } = await api.push({
        deviceId: state.deviceId,
        deviceName,
        clientVersion,
        changes: batch.map(toChange),
      });
      // A server that answers for none of them would be asked again forever.
      if ((await settleBatch(db, batch, results)) === 0) return;
    }
  }

  /**
   * Pulls pages until the server has nothing newer, counting rows towards the first total. Returns
   * the user's groups as the last page listed them.
   */
  private async pullAll(): Promise<PulledGroup[] | undefined> {
    const { db, api, deviceName } = this.deps;
    const state = await db.syncState.get(SYNC_STATE_KEY);
    if (!state) return undefined;
    const device = { deviceId: state.deviceId, deviceName };
    const firstSync = state.cursor === 0;
    let cursor = state.cursor;
    let total: number | undefined;
    let done = 0;
    for (;;) {
      const sentAt = Date.now();
      const page = await api.pull(cursor, device);
      total ??= page.remaining;
      const offset = clockOffset(page.serverTime, sentAt, Date.now());
      await applyPage(db, page, offset);
      done += page.rows.length;
      if (total > 0) this.set({ progress: { done: Math.min(done, total), total, firstSync } });
      cursor = page.nextCursor;
      if (!page.hasMore) return page.groups;
    }
  }

  private failed(error: unknown): void {
    if (error instanceof ApiRequestError && error.status === 401) {
      this.set({ phase: 'signed-out', progress: null });
      this.onUnauthorized?.();
      return;
    }
    if (error instanceof ApiRequestError && error.errorCode === 'EMAIL_NOT_VERIFIED') {
      this.set({ phase: 'unverified', progress: null });
      return;
    }
    if (error instanceof ApiRequestError && error.status === 426) {
      this.blocked = true;
      this.set({ phase: 'update-required', progress: null });
      return;
    }
    if (!(error instanceof NetworkError) && !(error instanceof ApiRequestError)) {
      console.error('Sync:', error);
    }
    const delay = Math.min(BACKOFF_MS.first * 2 ** this.failures, BACKOFF_MS.max);
    this.failures += 1;
    this.set({
      phase: error instanceof NetworkError ? 'offline' : 'failing',
      progress: null,
      failingSince: this.status.failingSince ?? new Date().toISOString(),
    });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.run();
    }, delay);
  }

  private set(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const listener of this.listeners) listener();
  }
}

/**
 * Whether this device's notes may sync with `account`: they're a guest's (and join the account
 * now, §6.6), or they last synced with it. Notes of another account wait for the user's choice.
 */
async function claimDevice(db: LampDb, account: MeResponse): Promise<boolean> {
  return db.transaction('rw', db.syncState, async () => {
    const state = await db.syncState.get(SYNC_STATE_KEY);
    if (!state) return false;
    if (state.ownerUserId !== null && state.ownerUserId !== account.id) return false;
    if (state.ownerUserId === null || state.ownerEmail !== account.email) {
      await db.syncState.update(SYNC_STATE_KEY, {
        ownerUserId: account.id,
        ownerEmail: account.email,
      });
    }
    return true;
  });
}

function withLock(run: () => Promise<void>): Promise<void> {
  const locks = globalThis.navigator?.locks;
  return locks ? locks.request(LOCK_NAME, run) : run();
}
