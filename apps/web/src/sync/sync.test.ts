import {
  type Change,
  type EntityName,
  keysBetween,
  type MeResponse,
  newId,
  type PulledRow,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type PushResult,
  type SectionBody,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createLesson, type LessonFields, updateLesson } from '@/data/actions/lessons.ts';
import { createSection, updateSection } from '@/data/actions/sections.ts';
import { updateSettings } from '@/data/actions/settings.ts';
import { onRowsChanged, type RowRef } from '@/data/changes.ts';
import { LampDb, type OutboxEntry, SETTINGS_KEY, SYNC_STATE_KEY } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { ApiRequestError, NetworkError } from '@/lib/api.ts';
import { allDocs, changedDocs } from '@/search/read-docs.ts';
import { TextIndex } from '@/search/text-index.ts';
import { deviceName } from './device-name.ts';
import { BACKOFF_MS, type SyncApi, SyncEngine, WRITE_DEBOUNCE_MS } from './engine.ts';
import { discardRejected, settleBatch, takeBatch } from './outbox.ts';
import { applyPage, clockOffset } from './pull.ts';

const NOW = '2026-10-13T09:00:00.000Z';
const SEEDED_TAGS = 24;

const body = (text: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const LESSON: LessonFields = {
  seriesId: null,
  title: 'The Good Shepherd',
  date: '2026-10-11',
  source: 'sermon',
  speaker: null,
  church: null,
  mainPassages: [],
};
const ACCOUNT: MeResponse = {
  id: newId(),
  email: 'reader@example.com',
  emailVerifiedAt: NOW,
  role: 'user',
};

/**
 * A server holding one account's rows in memory: every change is applied with the next rev
 * (no conflicts; those are the server's tests), and a pull pages through rows after the cursor.
 */
class FakeServer implements SyncApi {
  rev = 0;
  readonly rows = new Map<string, PulledRow>();
  pageSize = 500;
  pushes: PushRequest[] = [];
  /** Changes refused, by `rowKey`-like `entity:id`. */
  refuse = new Set<string>();
  /** Thrown by the next requests instead of answering. */
  failures: Error[] = [];
  serverTime: string | undefined;

  async push(request: PushRequest): Promise<PushResponse> {
    this.fail();
    this.pushes.push(structuredClone(request));
    return { results: request.changes.map((change) => this.apply(change)) };
  }

  async pull(cursor: number): Promise<PullResponse> {
    this.fail();
    const after = [...this.rows.values()]
      .filter(({ row }) => row.rev > cursor)
      .toSorted((a, b) => a.row.rev - b.row.rev);
    const rows = after.slice(0, this.pageSize);
    return {
      rows,
      nextCursor: rows.at(-1)?.row.rev ?? cursor,
      hasMore: after.length > rows.length,
      remaining: after.length,
      serverTime: this.serverTime ?? new Date().toISOString(),
      minClientVersion: '0.0.0',
    };
  }

  /** Writes a row as another device would. */
  put(entity: EntityName, row: Record<string, unknown>): void {
    const rev = ++this.rev;
    this.rows.set(key(entity, row.id as string | undefined), {
      entity,
      row: { ...row, rev },
    } as PulledRow);
  }

  get(entity: EntityName, id?: string) {
    return this.rows.get(key(entity, id))?.row as Record<string, unknown> | undefined;
  }

  private apply(change: Change): PushResult {
    const id = change.entity === 'userSettings' ? undefined : change.entityId;
    if (this.refuse.has(key(change.entity, id))) {
      return { changeId: change.changeId, status: 'rejected', errorCode: 'INVALID', message: 'No' };
    }
    const stored = this.get(change.entity, id);
    const row =
      change.op === 'delete'
        ? { ...stored, deletedAt: change.clientTime, updatedAt: change.clientTime }
        : change.row;
    this.put(change.entity, row);
    return { changeId: change.changeId, status: 'applied', rev: this.rev };
  }

  private fail() {
    const failure = this.failures.shift();
    if (failure) throw failure;
  }
}

/** The row id of a queued change; settings have none. */
const idOf = (change: OutboxEntry) => ('entityId' in change ? change.entityId : undefined);

const key = (entity: EntityName, id?: string) => (id ? `${entity}:${id}` : entity);

let db: LampDb;
let dbCount = 0;
const engines: SyncEngine[] = [];

async function device(): Promise<LampDb> {
  const made = new LampDb(`sync-${++dbCount}`, { indexedDB, IDBKeyRange });
  await ensureDevice(made, { themePreset: 'parchment', colorMode: 'system', look: 'classic' });
  return made;
}

function engineFor(on: LampDb, server: SyncApi, account: MeResponse | null = ACCOUNT) {
  const engine = new SyncEngine({
    db: on,
    api: server,
    deviceName: 'Chrome on Android',
    clientVersion: '0.0.0',
  });
  engine.setAccount(account);
  engines.push(engine);
  return engine;
}

beforeEach(async () => {
  db = await device();
});

afterEach(async () => {
  for (const engine of engines.splice(0)) engine.stop();
  vi.useRealTimers();
  await db.delete();
});

const state = async (on = db) => (await on.syncState.get(SYNC_STATE_KEY))!;

describe('the outbox', () => {
  it('merges edits queued one after another for one row, but not across another row', async () => {
    const lesson = await createLesson(LESSON, db);
    const section = await createSection(
      { lessonId: lesson.id, parentId: null, orderKey: 'a0', body: body('I'), conflictOf: null },
      db,
    );
    await db.outbox.clear();

    await updateSection(section.id, { body: body('I am') }, db);
    await updateSection(section.id, { body: body('I am the') }, db);
    await updateSection(section.id, { orderKey: 'a1' }, db);
    await updateSection(section.id, { body: body('I am the door') }, db);
    await createSection(
      { lessonId: lesson.id, parentId: null, orderKey: 'a2', body: body('2'), conflictOf: null },
      db,
    );
    await updateSection(section.id, { body: body('I am the door.') }, db);
    const queued = await db.outbox.toArray();

    const batch = await takeBatch(db);
    expect(batch.map((c) => [idOf(c), c.op])).toEqual([
      [section.id, 'upsert'],
      [expect.any(String), 'upsert'],
      [section.id, 'upsert'],
    ]);
    const [merged] = batch;
    expect(merged).toMatchObject({
      changeId: queued[0]!.changeId,
      baseRev: 0,
      clientTime: queued[3]!.clientTime,
      row: { body: body('I am the door'), orderKey: 'a1' },
      sent: true,
    });
    expect(new Set((merged as { changed?: string[] }).changed)).toEqual(
      new Set(['body', 'orderKey', 'updatedAt']),
    );
    expect(await db.outbox.count()).toBe(3);
  });

  it('never merges a change already sent, so a retry sends the same changes', async () => {
    await db.outbox.clear();
    const lesson = await createLesson(LESSON, db);
    const [sent] = await takeBatch(db);
    await rename(lesson.id, 'Renamed');
    const again = await takeBatch(db);
    expect(again).toEqual([
      { ...sent, sent: true },
      expect.objectContaining({
        entityId: lesson.id,
        row: expect.objectContaining({ title: 'Renamed' }),
      }),
    ]);
  });

  it('sends a new row with every field, merged with its edits', async () => {
    const lesson = await createLesson(LESSON, db);
    await rename(lesson.id, 'Renamed');
    const batch = await takeBatch(db);
    const merged = batch.find((c) => idOf(c) === lesson.id)!;
    expect(merged).toMatchObject({ baseRev: 0, row: { title: 'Renamed' } });
    expect(merged).not.toHaveProperty('changed');
  });

  it('takes at most 100 changes a push, and sends them again until they are answered', async () => {
    for (let i = 0; i < 90; i++) await createLesson({ ...LESSON, title: `${i}` }, db);
    const first = await takeBatch(db);
    expect(first).toHaveLength(100);
    expect(await takeBatch(db)).toEqual(first);
    await settleBatch(
      db,
      first,
      first.map((c, i) => ({ changeId: c.changeId, status: 'applied', rev: i + 1 })),
    );
    expect(await takeBatch(db)).toHaveLength(SEEDED_TAGS + 90 - 100);
  });

  it('moves the row and its queued changes to the rev the server gave', async () => {
    const lesson = await createLesson(LESSON, db);
    const batch = await takeBatch(db);
    await rename(lesson.id, 'Renamed');
    const results = batch.map((c, i) => ({
      changeId: c.changeId,
      status: 'applied' as const,
      rev: i + 1,
    }));
    await settleBatch(db, batch, results);
    const rev = results.at(-1)!.rev;
    expect((await db.lesson.get(lesson.id))!.rev).toBe(rev);
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ entityId: lesson.id, baseRev: rev }),
    ]);
    expect((await state()).lastPushAt).not.toBeNull();
  });

  it('keeps a rejected change and holds back later changes to its row', async () => {
    const lesson = await createLesson(LESSON, db);
    const other = await createLesson({ ...LESSON, title: 'Other' }, db);
    const batch = await takeBatch(db);
    await settleBatch(
      db,
      batch,
      batch.map((c) =>
        idOf(c) === lesson.id
          ? { changeId: c.changeId, status: 'rejected', errorCode: 'INVALID', message: 'Bad row' }
          : { changeId: c.changeId, status: 'applied', rev: 1 },
      ),
    );
    await rename(lesson.id, 'Renamed');
    await rename(other.id, 'Other renamed');

    const next = await takeBatch(db);
    expect(next.map(idOf)).toEqual([other.id]);
    const rejected = await db.outbox.filter((c) => c.rejected !== undefined).toArray();
    expect(rejected).toEqual([
      expect.objectContaining({
        entityId: lesson.id,
        rejected: { errorCode: 'INVALID', message: 'Bad row' },
      }),
    ]);

    // Discarding it drops the held change too; the server never took the row, so it goes.
    const changes: RowRef[] = [];
    const off = onRowsChanged((refs) => changes.push(...refs));
    await discardRejected(db, rejected[0]!.seq!);
    off();
    expect(await db.lesson.get(lesson.id)).toBeUndefined();
    expect(await db.outbox.filter((c) => idOf(c) === lesson.id).count()).toBe(0);
    expect(changes).toEqual([{ entity: 'lesson', id: lesson.id }]);
  });

  it('pulls a rejected row again from the server when its change is discarded', async () => {
    const lesson = await createLesson(LESSON, db);
    // As if pushed at rev 7, and pulled up to rev 12.
    await db.outbox.clear();
    await db.lesson.update(lesson.id, { rev: 7 });
    await db.syncState.update(SYNC_STATE_KEY, { cursor: 12 });
    await rename(lesson.id, 'Renamed');
    const [change] = await takeBatch(db);
    await settleBatch(
      db,
      [change!],
      [{ changeId: change!.changeId, status: 'rejected', errorCode: 'X', message: 'x' }],
    );
    await discardRejected(db, change!.seq!);
    expect(await db.outbox.count()).toBe(0);
    expect((await state()).cursor).toBe(6);
    expect(await db.lesson.get(lesson.id)).toBeDefined();
  });
});

/** Renames a lesson, as the lesson screen does. */
const rename = (id: string, title: string) => updateLesson(id, { title }, db);

/** Lets IndexedDB work finish (fake-indexeddb runs on `setImmediate`, not the faked timers). */
async function until(done: () => boolean) {
  for (let i = 0; i < 1000 && !done(); i++) await new Promise((r) => setImmediate(r));
  expect(done()).toBe(true);
}

const page = (rows: PulledRow[], nextCursor: number): PullResponse => ({
  rows,
  nextCursor,
  hasMore: false,
  remaining: rows.length,
  serverTime: NOW,
  minClientVersion: '0.0.0',
});
const remoteLesson = (fields: Partial<Record<string, unknown>> = {}) => ({
  ...LESSON,
  id: newId(),
  createdAt: NOW,
  updatedAt: NOW,
  deletedAt: null,
  rev: 3,
  mainPassages: [
    { book: 'JHN', chapter: 10, verseStart: 9, display: 'John 10:9', translation: 'WEB' },
  ],
  ...fields,
});

describe('a pulled page', () => {
  it('is stored as sent, tombstones too, with citations, the cursor and the clock offset', async () => {
    const lesson = remoteLesson();
    const gone = remoteLesson({ rev: 4, deletedAt: NOW });
    const settings = {
      ...(await db.userSettings.get(SETTINGS_KEY))!,
      themePreset: 'midnight',
      rev: 5,
    };
    const stored = await applyPage(
      db,
      page(
        [
          { entity: 'lesson', row: lesson },
          { entity: 'lesson', row: gone },
          { entity: 'userSettings', row: settings },
        ] as PulledRow[],
        5,
      ),
      -1500,
    );
    expect(stored).toBe(3);
    expect(await db.lesson.get(lesson.id)).toEqual(lesson);
    expect(await db.lesson.get(gone.id)).toEqual(gone);
    expect(await db.userSettings.get(SETTINGS_KEY)).toEqual(settings);
    expect(await db.citation.where('sourceId').equals(lesson.id).count()).toBe(1);
    expect(await db.citation.where('sourceId').equals(gone.id).count()).toBe(0);
    expect(await state()).toMatchObject({ cursor: 5, clockOffsetMs: -1500 });
  });

  it('skips a row the outbox has a change for, until that change is pushed', async () => {
    const mine = await createLesson(LESSON, db);
    await updateSettings({ themePreset: 'midnight' }, db);
    const theirs = { ...mine, title: 'Theirs', rev: 2 };
    const settings = {
      ...(await db.userSettings.get(SETTINGS_KEY))!,
      themePreset: 'olive',
      rev: 3,
    };
    const stored = await applyPage(
      db,
      page(
        [
          { entity: 'lesson', row: theirs },
          { entity: 'userSettings', row: settings },
        ] as PulledRow[],
        3,
      ),
      0,
    );
    expect(stored).toBe(0);
    expect((await db.lesson.get(mine.id))!.title).toBe('The Good Shepherd');
    expect((await db.userSettings.get(SETTINGS_KEY))!.themePreset).toBe('midnight');
    expect((await state()).cursor).toBe(3);
  });

  it('updates the search index with the pulled rows', async () => {
    const index = new TextIndex();
    index.addAll(await allDocs(db));
    const changes: RowRef[] = [];
    const off = onRowsChanged((refs) => changes.push(...refs));
    const lesson = remoteLesson({ title: 'Seventy times seven' });
    const section = {
      id: newId(),
      lessonId: lesson.id,
      parentId: null,
      orderKey: 'a0',
      body: body('Forgiveness keeps no ledger'),
      conflictOf: null,
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
      rev: 4,
    };
    await applyPage(
      db,
      page(
        [
          { entity: 'lesson', row: lesson },
          { entity: 'section', row: section },
        ] as PulledRow[],
        4,
      ),
      0,
    );
    off();
    expect(changes).toEqual([
      { entity: 'lesson', id: lesson.id },
      { entity: 'section', id: section.id },
    ]);
    for (const [id, doc] of await changedDocs(changes, db)) index.set(id, doc);
    expect(index.search('ledger').map((hit) => hit.id)).toEqual([section.id]);
    expect(index.search('seventy').map((hit) => hit.id)).toEqual([lesson.id]);

    // A pulled delete takes it out again.
    await applyPage(
      db,
      page([{ entity: 'section', row: { ...section, deletedAt: NOW, rev: 5 } }] as PulledRow[], 5),
      0,
    );
    for (const [id, doc] of await changedDocs([{ entity: 'section', id: section.id }], db)) {
      index.set(id, doc);
    }
    expect(index.search('ledger')).toEqual([]);
  });

  it('takes the server clock as read halfway through the request', () => {
    expect(clockOffset('2026-10-13T09:00:10.000Z', Date.parse(NOW), Date.parse(NOW) + 2000)).toBe(
      9000,
    );
  });
});

/** A device's sections, as sync should leave them. */
const notes = async (on: LampDb) =>
  (await on.section.toArray()).map(({ id, body: b, rev }) => ({ id, b, rev }));

describe('the engine', () => {
  it('pushes the outbox, then pulls what other devices wrote', async () => {
    const server = new FakeServer();
    const theirs = { ...LESSON, id: newId(), createdAt: NOW, updatedAt: NOW, deletedAt: null };
    server.put('lesson', theirs);
    const mine = await createLesson({ ...LESSON, title: 'Mine' }, db);

    const engine = engineFor(db, server);
    await engine.syncNow();

    expect(engine.getStatus()).toMatchObject({ phase: 'synced', failingSince: null });
    expect(server.pushes).toHaveLength(1);
    expect(server.pushes[0]).toMatchObject({
      deviceId: (await state()).deviceId,
      deviceName: 'Chrome on Android',
      clientVersion: '0.0.0',
    });
    expect(server.pushes[0]!.changes).toHaveLength(SEEDED_TAGS + 1);
    expect(server.pushes[0]!.changes[0]).not.toHaveProperty('sent');
    expect(await db.outbox.count()).toBe(0);
    expect(server.get('lesson', mine.id)).toMatchObject({ title: 'Mine' });
    expect(await db.lesson.get(theirs.id)).toMatchObject({ title: 'The Good Shepherd', rev: 1 });
    expect((await db.lesson.get(mine.id))!.rev).toBe(server.rev);
    expect(await state()).toMatchObject({ cursor: server.rev, ownerUserId: ACCOUNT.id });
  });

  it('brings two devices to the same notes', async () => {
    const server = new FakeServer();
    const other = await device();
    const lesson = await createLesson(LESSON, db);
    await engineFor(db, server).syncNow();
    await engineFor(other, server).syncNow();
    const keys = keysBetween(null, null, 2);
    await createSection(
      {
        lessonId: lesson.id,
        parentId: null,
        orderKey: keys[0]!,
        body: body('A'),
        conflictOf: null,
      },
      other,
    );
    await engines[1]!.syncNow();
    await engines[0]!.syncNow();

    expect(await notes(db)).toEqual(await notes(other));
    expect(await db.lesson.get(lesson.id)).toEqual(await other.lesson.get(lesson.id));
    await other.delete();
  });

  it('pushes the rest when a change is rejected; later changes to its row wait', async () => {
    const server = new FakeServer();
    const lesson = await createLesson(LESSON, db);
    server.refuse.add(`lesson:${lesson.id}`);
    const engine = engineFor(db, server);
    await engine.syncNow();
    expect(server.pushes[0]!.changes).toHaveLength(SEEDED_TAGS + 1);
    expect(await db.outbox.toArray()).toEqual([
      expect.objectContaining({ entityId: lesson.id, rejected: expect.any(Object) }),
    ]);

    await rename(lesson.id, 'Renamed');
    await engine.syncNow();
    expect(server.pushes).toHaveLength(1);
    expect(await db.outbox.count()).toBe(2);
  });

  it('shows progress through a first sync, page by page', async () => {
    const server = new FakeServer();
    server.pageSize = 2;
    for (let i = 0; i < 5; i++) {
      server.put('lesson', {
        ...LESSON,
        id: newId(),
        createdAt: NOW,
        updatedAt: NOW,
        deletedAt: null,
      });
    }
    await db.outbox.clear();
    const engine = engineFor(db, server);
    const seen: unknown[] = [];
    engine.subscribe(() => seen.push(engine.getStatus().progress));
    await engine.syncNow();
    expect(seen.filter(Boolean)).toEqual([
      { done: 2, total: 5, firstSync: true },
      { done: 4, total: 5, firstSync: true },
      { done: 5, total: 5, firstSync: true },
    ]);
    expect(engine.getStatus().progress).toBeNull();
    expect(await db.lesson.count()).toBe(5);
  });

  it('keeps the clock offset from the server time', async () => {
    const server = new FakeServer();
    server.serverTime = new Date(Date.now() + 10 * 60_000).toISOString();
    await engineFor(db, server).syncNow();
    expect((await state()).clockOffsetMs).toBeGreaterThan(9 * 60_000);
  });

  it("doesn't sync a guest, an unverified account, or notes of another account", async () => {
    const server = new FakeServer();
    const guest = engineFor(db, server, null);
    await guest.syncNow();
    expect(guest.getStatus().phase).toBe('guest');

    const unverified = engineFor(db, server, { ...ACCOUNT, emailVerifiedAt: null });
    await unverified.syncNow();
    expect(unverified.getStatus().phase).toBe('unverified');
    expect((await state()).ownerUserId).toBeNull();

    await db.syncState.update(SYNC_STATE_KEY, { ownerUserId: newId() });
    const other = engineFor(db, server);
    await other.syncNow();
    expect(other.getStatus().phase).toBe('other-account');
    expect(server.pushes).toEqual([]);

    // Signed out after syncing as that account: the notes wait for it.
    const signedOut = engineFor(db, server, null);
    await signedOut.syncNow();
    expect(signedOut.getStatus().phase).toBe('signed-out');
  });

  it('stops on 401, an unverified answer and 426', async () => {
    const server = new FakeServer();
    const engine = engineFor(db, server);
    const unauthorized = vi.fn<() => void>();
    engine.onUnauthorized = unauthorized;

    server.failures = [new ApiRequestError(401, 'UNAUTHORIZED', 'No session')];
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('signed-out');
    expect(unauthorized).toHaveBeenCalledOnce();

    server.failures = [new ApiRequestError(403, 'EMAIL_NOT_VERIFIED', 'Verify')];
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('unverified');

    server.failures = [new ApiRequestError(426, 'UPGRADE_REQUIRED', 'Update')];
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('update-required');
    await engine.syncNow();
    expect(server.pushes).toEqual([]);
    expect(engine.getStatus().phase).toBe('update-required');
  });

  it('retries with backoff from 5 s, and "Sync now" goes at once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const server = new FakeServer();
    const engine = engineFor(db, server);
    server.failures = [
      new NetworkError('down'),
      new NetworkError('down'),
      new ApiRequestError(500, 'INTERNAL', 'Oops'),
    ];
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('offline');
    const since = engine.getStatus().failingSince;
    expect(since).not.toBeNull();

    await vi.advanceTimersByTimeAsync(BACKOFF_MS.first - 1);
    expect(server.failures).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => server.failures.length === 1 && engine.getStatus().phase === 'offline');
    // Then twice as long.
    await vi.advanceTimersByTimeAsync(2 * BACKOFF_MS.first - 1);
    expect(server.failures).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => engine.getStatus().phase === 'failing');
    expect(engine.getStatus().failingSince).toBe(since);

    // A retry waits 20 s now, but "Sync now" doesn't.
    await engine.syncNow();
    expect(engine.getStatus()).toMatchObject({ phase: 'synced', failingSince: null });
  });

  it('pushes 2 s after the last write, once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
    const server = new FakeServer();
    const engine = engineFor(db, server);
    engine.start();
    await until(() => engine.getStatus().phase === 'synced');
    expect(server.pushes).toHaveLength(1);

    const lesson = await createLesson(LESSON, db);
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS - 500);
    await rename(lesson.id, 'Renamed');
    await vi.advanceTimersByTimeAsync(WRITE_DEBOUNCE_MS - 1);
    expect(server.pushes).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await until(() => server.pushes.length === 2 && engine.getStatus().phase === 'synced');
    // The create and the rename, merged.
    expect(server.pushes[1]!.changes).toEqual([
      expect.objectContaining({
        entityId: lesson.id,
        row: expect.objectContaining({ title: 'Renamed' }),
      }),
    ]);
  });

  it('never runs two syncs at once; a trigger during one runs once more after it', async () => {
    const server = new FakeServer();
    let pulls = 0;
    let inFlight = 0;
    const api: SyncApi = {
      push: (request) => server.push(request),
      pull: async (cursor) => {
        inFlight += 1;
        expect(inFlight).toBe(1);
        pulls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return server.pull(cursor);
      },
    };
    const engine = engineFor(db, api);
    await Promise.all([engine.syncNow(), engine.syncNow(), engine.syncNow()]);
    expect(pulls).toBe(2);
  });
});

describe('the device name', () => {
  it('names the browser and the system', () => {
    const ua = {
      android:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
      iphone:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
      firefox:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:131.0) Gecko/20100101 Firefox/131.0',
    };
    expect(deviceName(ua.android)).toBe('Chrome on Android');
    expect(deviceName(ua.iphone)).toBe('Safari on iOS');
    expect(deviceName(ua.edge)).toBe('Edge on Windows');
    expect(deviceName(ua.firefox)).toBe('Firefox on macOS');
    expect(deviceName('curl/8')).toBe('Browser');
  });
});
