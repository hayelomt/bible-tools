import {
  type Change,
  ENTITY_NAMES,
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
  SEED_TAGS,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createLesson,
  deleteLesson,
  type LessonFields,
  updateLesson,
} from '@/data/actions/lessons.ts';
import { addQuestion, promoteQuestion } from '@/data/actions/questions.ts';
import { createSection, updateSection } from '@/data/actions/sections.ts';
import { updateSettings } from '@/data/actions/settings.ts';
import { addTag, removeTag } from '@/data/actions/tags.ts';
import { onRowsChanged, type RowRef } from '@/data/changes.ts';
import {
  LampDb,
  type OutboxEntry,
  type RowEntity,
  SETTINGS_KEY,
  SYNC_STATE_KEY,
} from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';
import { ApiRequestError, NetworkError } from '@/lib/api.ts';
import { allDocs, changedDocs } from '@/search/read-docs.ts';
import { TextIndex } from '@/search/text-index.ts';
import { noteCounts, removeNotes, unsyncedCount } from './device-data.ts';
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

  /** The device each pull named. */
  pulledBy: { deviceId: string; deviceName: string }[] = [];

  async pull(cursor: number, by = { deviceId: '', deviceName: '' }): Promise<PullResponse> {
    this.fail();
    this.pulledBy.push(by);
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

  /** The live rows of one entity. */
  all(entity: EntityName) {
    return [...this.rows.values()]
      .filter(
        (pulled) =>
          pulled.entity === entity && (pulled.row as { deletedAt?: unknown }).deletedAt == null,
      )
      .map(({ row }) => row as Record<string, unknown>);
  }

  private apply(change: Change): PushResult {
    const id = change.entity === 'userSettings' ? undefined : change.entityId;
    const refuse = (errorCode: string) =>
      ({ changeId: change.changeId, status: 'rejected', errorCode, message: 'No' }) as const;
    if (this.refuse.has(key(change.entity, id))) return refuse('INVALID');
    // The two checks the server makes that matching tags by name is about.
    if (change.op === 'upsert' && change.entity === 'tag') {
      const name = change.row.name.toLowerCase();
      const taken = this.all('tag').some(
        (tag) => tag.id !== change.entityId && (tag.name as string).toLowerCase() === name,
      );
      if (taken) return refuse('DUPLICATE');
    }
    if (change.op === 'upsert' && 'tagId' in change.row && !this.get('tag', change.row.tagId)) {
      return refuse('REFERENCE_NOT_FOUND');
    }
    // A tag is on a section or lesson once.
    if (
      change.op === 'upsert' &&
      (change.entity === 'sectionTag' || change.entity === 'lessonTag')
    ) {
      const row = change.row as Record<string, unknown>;
      const owner = change.entity === 'sectionTag' ? 'sectionId' : 'lessonId';
      const taken = this.all(change.entity).some(
        (link) => link.id !== row.id && link.tagId === row.tagId && link[owner] === row[owner],
      );
      if (taken && row.deletedAt === null) return refuse('DUPLICATE');
    }
    const stored = this.get(change.entity, id);
    if (change.op === 'delete' && !stored) return refuse('NOT_FOUND');
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
const listening: Array<() => void> = [];
const ROW_ENTITIES = ENTITY_NAMES.filter((name): name is RowEntity => name !== 'userSettings');

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
  for (const stop of listening.splice(0)) stop();
  vi.useRealTimers();
  await db.delete();
});

const live = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((row) => row.deletedAt === null);

const state = async (on = db) => (await on.syncState.get(SYNC_STATE_KEY))!;

describe('the outbox', () => {
  it('merges edits queued one after another for one row, but not across another row', async () => {
    const lesson = await createLesson(LESSON, db);
    const section = await createSection(
      {
        lessonId: lesson.id,
        parentId: null,
        orderKey: 'a0',
        body: body('I'),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    await db.outbox.clear();

    await updateSection(section.id, { body: body('I am') }, db);
    await updateSection(section.id, { body: body('I am the') }, db);
    await updateSection(section.id, { orderKey: 'a1' }, db);
    await updateSection(section.id, { body: body('I am the door') }, db);
    await createSection(
      {
        lessonId: lesson.id,
        parentId: null,
        orderKey: 'a2',
        body: body('2'),
        conflictOf: null,
        conflictDevice: null,
      },
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
      conflictDevice: null,
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
    // Pulls name the device too, so it's listed from its first sync (§6.6).
    expect(server.pulledBy[0]).toEqual({
      deviceId: (await state()).deviceId,
      deviceName: 'Chrome on Android',
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
        conflictDevice: null,
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
    // The first run pulls before it pushes too, as the device has never pulled.
    expect(pulls).toBe(3);
  });
});

describe('guests and devices (§6.6)', () => {
  const OTHER: MeResponse = { ...ACCOUNT, id: newId(), email: 'second@example.com' };

  it("joins a guest's notes to the account, matching its tags by name", async () => {
    const server = new FakeServer();
    seedAccount(server, ['patience']);
    const lesson = await createLesson(LESSON, db);
    await addTag({ kind: 'lesson', id: lesson.id }, SEED_TAGS[0]!, db);
    await addTag({ kind: 'lesson', id: lesson.id }, 'Patience', db);
    await addTag({ kind: 'lesson', id: lesson.id }, 'Mercy', db);

    await engineFor(db, server).syncNow();

    expect(await db.outbox.count()).toBe(0);
    const serverTags = server.all('tag');
    expect(serverTags).toHaveLength(SEEDED_TAGS + 2);
    expect(new Set(serverTags.map((tag) => tag.id))).toEqual(new Set(await ids(db, 'tag')));
    const names = new Map(serverTags.map((tag) => [tag.id, tag.name]));
    const linked = server.all('lessonTag').map((link) => names.get(link.tagId as string));
    expect(linked.toSorted()).toEqual([SEED_TAGS[0], 'Mercy', 'patience'].toSorted());
    expect((await db.lessonTag.toArray()).map((link) => link.tagId).toSorted()).toEqual(
      server
        .all('lessonTag')
        .map((link) => link.tagId)
        .toSorted(),
    );
    expect(await state()).toMatchObject({ ownerUserId: ACCOUNT.id, ownerEmail: ACCOUNT.email });
  });

  it('repairs a tag refused because another device made the same one offline', async () => {
    const server = new FakeServer();
    const other = await device();
    const lesson = await createLesson(LESSON, db);
    await engineFor(db, server).syncNow();
    await engineFor(other, server).syncNow();
    await addTag({ kind: 'lesson', id: lesson.id }, 'Patience', db);
    await addTag({ kind: 'lesson', id: lesson.id }, 'patience', other);

    await engines[0]!.syncNow();
    await engines[1]!.syncNow();
    expect((await other.outbox.toArray()).map((entry) => entry.rejected?.errorCode)).toEqual([
      'DUPLICATE',
      'REFERENCE_NOT_FOUND',
    ]);

    await engines[1]!.syncNow();
    expect(await other.outbox.count()).toBe(0);
    expect(server.all('tag').filter((tag) => tag.name === 'Patience')).toHaveLength(1);
    // Both devices put the tag on the lesson; the second link was dropped as the same one.
    expect(server.all('lessonTag')).toHaveLength(1);
    await engines[0]!.syncNow();
    expect(await db.lessonTag.toArray()).toEqual(await other.lessonTag.toArray());
    await other.delete();
  });

  it('merges a link refused because another device put the same tag on offline', async () => {
    const server = new FakeServer();
    const other = await device();
    const kept = await createLesson(LESSON, db);
    const untagged = await createLesson({ ...LESSON, title: 'Untagged' }, db);
    const again = await createLesson({ ...LESSON, title: 'Tagged again' }, db);
    await engineFor(db, server).syncNow();
    await engineFor(other, server).syncNow();
    const grace = SEED_TAGS[0]!;
    for (const lesson of [kept, untagged, again]) {
      await addTag({ kind: 'lesson', id: lesson.id }, grace, db);
    }
    await addTag({ kind: 'lesson', id: kept.id }, grace, other);
    // The other device takes its own link off one lesson, and off then on again another.
    const { link } = await addTag({ kind: 'lesson', id: untagged.id }, grace, other);
    await removeTag(link, other);
    const { link: first } = await addTag({ kind: 'lesson', id: again.id }, grace, other);
    await removeTag(first, other);
    await addTag({ kind: 'lesson', id: again.id }, grace, other);

    await engines[0]!.syncNow();
    await engines[1]!.syncNow();
    expect((await other.outbox.toArray()).some((e) => e.rejected?.errorCode === 'DUPLICATE')).toBe(
      true,
    );
    await engines[1]!.syncNow();
    await engines[0]!.syncNow();

    expect(await other.outbox.count()).toBe(0);
    // One link each, the first device's; the lesson untagged there is untagged everywhere.
    const links = server.all('lessonTag');
    expect(links.map((l) => l.lessonId).toSorted()).toEqual([kept.id, again.id].toSorted());
    for (const on of [db, other]) {
      expect(new Set(live(await on.lessonTag.toArray()).map((l) => l.id))).toEqual(
        new Set(links.map((l) => l.id)),
      );
    }
    await other.delete();
  });

  it("removes another account's notes, unsynced changes too, then pulls this account", async () => {
    const first = new FakeServer();
    const kept = await createLesson({ ...LESSON, title: 'Synced' }, db);
    await engineFor(db, first).syncNow();
    await createLesson({ ...LESSON, title: 'Never synced' }, db);
    const { deviceId } = await state();

    const second = new FakeServer();
    seedAccount(second);
    const theirs = { ...LESSON, id: newId(), title: 'Theirs', createdAt: NOW, updatedAt: NOW };
    second.put('lesson', { ...theirs, deletedAt: null });
    const engine = engineFor(db, second, OTHER);
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('other-account');
    expect(await state()).toMatchObject({ ownerUserId: ACCOUNT.id, ownerEmail: ACCOUNT.email });
    expect(await unsyncedCount(db)).toBe(1);
    const indexed = rowsChanged();

    await engine.resolveOtherAccount('remove');

    expect(engine.getStatus().phase).toBe('synced');
    expect((await db.lesson.toArray()).map((l) => l.title)).toEqual(['Theirs']);
    expect(indexed).toContainEqual({ entity: 'lesson', id: kept.id });
    expect(second.pushes.flatMap((push) => push.changes)).toEqual([]);
    expect(await db.tag.count()).toBe(SEEDED_TAGS);
    expect(await state()).toMatchObject({
      deviceId,
      ownerUserId: OTHER.id,
      ownerEmail: OTHER.email,
      cursor: second.rev,
    });
  });

  it("adds another account's notes as copies with new ids, unsynced changes included", async () => {
    const first = new FakeServer();
    const lesson = await createLesson(LESSON, db);
    const keys = keysBetween(null, null, 2);
    const parent = await createSection(
      {
        lessonId: lesson.id,
        parentId: null,
        orderKey: keys[0]!,
        body: body('P'),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const child = await createSection(
      {
        lessonId: lesson.id,
        parentId: parent.id,
        orderKey: keys[0]!,
        body: body('C'),
        conflictOf: null,
        conflictDevice: null,
      },
      db,
    );
    const question = await addQuestion(lesson.id, 'Who is the door?', db);
    const answer = await promoteQuestion(question.id, undefined, db);
    await addTag({ kind: 'section', id: child.id }, 'Kindness', db);
    const gone = await createLesson({ ...LESSON, title: 'Deleted' }, db);
    await deleteLesson(gone.id, db);
    await engineFor(db, first).syncNow();
    await rename(lesson.id, 'Renamed offline');
    const oldIds = new Set(
      (await Promise.all(ROW_ENTITIES.map((entity) => ids(db, entity)))).flat(),
    );
    const firstPushes = first.pushes.length;

    const second = new FakeServer();
    seedAccount(second, ['KINDNESS']);
    const engine = engineFor(db, second, OTHER);
    await engine.syncNow();
    await engine.resolveOtherAccount('add');

    expect(engine.getStatus().phase).toBe('synced');
    expect(first.pushes).toHaveLength(firstPushes);
    expect(await db.outbox.count()).toBe(0);
    const mentioned = JSON.stringify(second.pushes).match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) ?? [];
    expect(mentioned.filter((id) => oldIds.has(id))).toEqual([]);
    const lessons = second.all('lesson');
    expect(lessons.map((l) => l.title)).toEqual(['Renamed offline']);
    const newLesson = lessons[0]!.id as string;
    const sections = second.all('section');
    expect(sections).toHaveLength(3);
    expect(sections.every((s) => s.lessonId === newLesson)).toBe(true);
    const copiedChild = sections.find((s) => s.parentId !== null)!;
    expect(sections.find((s) => s.id === copiedChild.parentId)!.body).toEqual(body('P'));
    const [copiedQuestion] = second.all('question');
    expect(copiedQuestion).toMatchObject({ lessonId: newLesson });
    expect(sections.find((s) => s.id === copiedQuestion!.answerSectionId)!.body).toEqual(
      answer.body,
    );
    const kindness = second.all('tag').find((tag) => tag.name === 'KINDNESS')!;
    expect(second.all('sectionTag')).toEqual([
      expect.objectContaining({ tagId: kindness.id, sectionId: copiedChild.id }),
    ]);
    expect(second.all('tag')).toHaveLength(SEEDED_TAGS + 1);
    // The device holds exactly the account's rows.
    for (const entity of ROW_ENTITIES) {
      expect((await ids(db, entity)).toSorted()).toEqual(
        second
          .all(entity)
          .map((row) => row.id)
          .toSorted(),
      );
    }
  });

  it('keeps the notes on sign-out; their changes sync when the account signs in again', async () => {
    const server = new FakeServer();
    const lesson = await createLesson(LESSON, db);
    const engine = engineFor(db, server);
    await engine.syncNow();
    engine.setAccount(null);
    await engine.syncNow();
    expect(engine.getStatus().phase).toBe('signed-out');

    await rename(lesson.id, 'Edited');
    await rename(lesson.id, 'Edited while signed out');
    expect(await unsyncedCount(db)).toBe(1);
    await engine.syncNow();
    expect(server.get('lesson', lesson.id)).toMatchObject({ title: 'The Good Shepherd' });

    engine.setAccount(ACCOUNT);
    await engine.syncNow();
    expect(server.get('lesson', lesson.id)).toMatchObject({ title: 'Edited while signed out' });
  });

  it('removes the notes from a signed-out device, which starts again as a new guest', async () => {
    const server = new FakeServer();
    const lesson = await createLesson(LESSON, db);
    await updateSettings({ look: 'folio' }, db);
    await engineFor(db, server).syncNow();
    await rename(lesson.id, 'Unsynced');
    const { deviceId } = await state();
    const indexed = rowsChanged();

    await removeNotes(db, null);

    expect(await db.lesson.count()).toBe(0);
    expect(indexed).toContainEqual({ entity: 'lesson', id: lesson.id });
    expect(await db.tag.filter((tag) => tag.rev === 0).count()).toBe(SEEDED_TAGS);
    expect(await db.outbox.count()).toBe(SEEDED_TAGS);
    expect(await db.userSettings.get(SETTINGS_KEY)).toMatchObject({ look: 'folio', rev: 0 });
    const after = await state();
    expect(after).toMatchObject({ ownerUserId: null, ownerEmail: null, cursor: 0 });
    expect(after.deviceId).not.toBe(deviceId);
    expect(await noteCounts(db)).toEqual({ lessons: 0, highlights: 0, memoryItems: 0 });
  });
});

/** The tags an account already has on the server, as its first device left them. */
function seedAccount(server: FakeServer, extra: string[] = []) {
  for (const name of [...SEED_TAGS, ...extra]) {
    server.put('tag', {
      id: newId(),
      name,
      isSeeded: (SEED_TAGS as readonly string[]).includes(name),
      createdAt: NOW,
      updatedAt: NOW,
      deletedAt: null,
    });
  }
}

const ids = async (on: LampDb, entity: RowEntity) =>
  (await on.rows(entity).toArray()).map((row) => row.id);

/** The rows reported to the search index from now on, until the test ends. */
function rowsChanged(): RowRef[] {
  const seen: RowRef[] = [];
  listening.push(onRowsChanged((refs) => seen.push(...refs)));
  return seen;
}

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
