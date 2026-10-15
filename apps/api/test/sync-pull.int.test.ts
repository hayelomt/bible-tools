import {
  apiErrorSchema,
  keysBetween,
  newId,
  type PulledRow,
  type PullResponse,
  pullResponseSchema,
} from '@lamp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullService } from '../src/sync/pull.service.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import * as sync from './int/sync.js';
import {
  type Account,
  bodyOf,
  LATER,
  lessonRow,
  NOW,
  type Row,
  remove,
  sectionRow,
  synced,
  tagRow,
  upsert,
} from './int/sync.js';

/** `GET /api/sync/pull` (§6.3): every row since the cursor, a page at a time, from one snapshot. */

// The minimum client version is a constant; these tests raise it to see the 426.
const min = vi.hoisted(() => ({ version: '0.0.0' }));
vi.mock('@lamp/domain', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@lamp/domain')>()),
  get MIN_CLIENT_VERSION() {
    return min.version;
  },
}));

let t: TestApp;
let client: Client;
let account: Account;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  min.version = '0.0.0';
  await truncateAll(t.prisma);
  client = await createClient(t);
  account = await sync.signUp(t, client);
});

const pullRequest = (
  cursor: number,
  {
    limit,
    clientVersion = '0.0.0',
    as = account,
  }: { limit?: number; clientVersion?: string; as?: Account } = {},
) => {
  const query = new URLSearchParams({
    cursor: String(cursor),
    clientVersion,
    deviceId: sync.DEVICE_ID,
    deviceName: 'Chrome on Android',
  });
  if (limit !== undefined) query.set('limit', String(limit));
  return client.get(`/api/sync/pull?${query}`, as.token);
};

async function pull(cursor: number, options: { limit?: number; as?: Account } = {}) {
  const res = await pullRequest(cursor, options).expect(200);
  return pullResponseSchema.parse(res.body);
}

/** Pulls from `cursor` until `hasMore` is false, as a new device does. */
async function pullAll(cursor = 0, limit?: number) {
  const pages: PullResponse[] = [];
  for (let page = await pull(cursor, { limit }); ; page = await pull(cursor, { limit })) {
    pages.push(page);
    cursor = page.nextCursor;
    if (!page.hasMore) return { pages, rows: pages.flatMap((p) => p.rows), cursor };
  }
}

const errorCode = (res: { body: unknown }) => apiErrorSchema.parse(res.body).errorCode;
const ids = (rows: PulledRow[]) =>
  rows.map(({ entity, row }) => `${entity}:${'id' in row ? row.id : ''}`);
const syncRev = async () =>
  Number((await t.prisma.user.findUniqueOrThrow({ where: { id: account.id } })).syncRev);

describe('a first pull from 0', () => {
  it('returns every row, tombstones included, as the device stores them', async () => {
    const lesson = lessonRow();
    const section = sectionRow(lesson.id);
    const gone = sectionRow(lesson.id, { orderKey: 'a1', body: bodyOf('deleted later') });
    const tag = tagRow('hope');
    const link = { ...synced(), tagId: tag.id, sectionId: section.id };
    const settings = {
      themePreset: 'olive',
      colorMode: 'dark',
      look: 'classic',
      defaultTranslation: 'BSB',
      reviewWindowDays: 14,
      autoPreviewVerses: false,
      updatedAt: NOW,
    };
    await sync.pushOk(client, account, [
      upsert('lesson', lesson),
      upsert('section', section),
      upsert('section', gone),
      upsert('tag', tag),
      upsert('sectionTag', link),
      {
        changeId: newId(),
        baseRev: 0,
        clientTime: NOW,
        entity: 'userSettings',
        op: 'upsert',
        row: settings,
      },
      remove('section', gone.id, 3),
    ]);

    const page = await pull(0);
    expect(page).toMatchObject({
      nextCursor: 7,
      hasMore: false,
      remaining: 6,
      minClientVersion: '0.0.0',
    });
    expect(Math.abs(Date.parse(page.serverTime) - Date.now())).toBeLessThan(60_000);
    expect(page.rows).toEqual([
      { entity: 'lesson', row: { ...lesson, rev: 1 } },
      { entity: 'section', row: { ...section, rev: 2 } },
      { entity: 'tag', row: { ...tag, rev: 4 } },
      { entity: 'sectionTag', row: { ...link, rev: 5 } },
      { entity: 'userSettings', row: { ...settings, rev: 6 } },
      { entity: 'section', row: { ...gone, rev: 7, deletedAt: LATER, updatedAt: LATER } },
    ]);
  });

  it('is empty for a new account, and so is a pull from the latest cursor', async () => {
    const empty = { rows: [], hasMore: false, remaining: 0 };
    expect(await pull(0)).toMatchObject({ ...empty, nextCursor: 0 });
    await sync.pushOk(client, account, [upsert('lesson', lessonRow())]);
    expect(await pull(1)).toMatchObject({ ...empty, nextCursor: 1 });
  });

  it("never returns another account's rows", async () => {
    const theirs = await sync.signUp(t, client);
    await sync.pushOk(client, theirs, [upsert('lesson', lessonRow({ title: 'Theirs' }))]);
    await sync.pushOk(client, account, [upsert('lesson', lessonRow({ title: 'Mine' }))]);
    const { rows } = await pull(0);
    expect(rows.map(({ row }) => (row as { title: string }).title)).toEqual(['Mine']);
    expect((await pull(0, { as: theirs })).rows).toHaveLength(1);
  });
});

describe('paging', () => {
  it('pages through in rev order with no row twice or missing', async () => {
    const lesson = lessonRow();
    const sections = Array.from({ length: 6 }, (_, i) =>
      sectionRow(lesson.id, { orderKey: `a${i}`, body: bodyOf(`note ${i}`) }),
    );
    await sync.pushOk(client, account, [
      upsert('lesson', lesson),
      ...sections.map((s) => upsert('section', s)),
    ]);

    const { pages, rows, cursor } = await pullAll(0, 3);
    // `remaining` counts this page and the rest, the total a first sync's progress shows.
    expect(pages.map((p) => [p.rows.length, p.nextCursor, p.hasMore, p.remaining])).toEqual([
      [3, 3, true, 7],
      [3, 6, true, 4],
      [1, 7, false, 1],
    ]);
    expect(ids(rows)).toEqual(ids((await pull(0)).rows));
    expect(rows).toHaveLength(7);
    expect(cursor).toBe(await syncRev());
  });

  it('defaults to 500 rows a page', async () => {
    const lesson = lessonRow();
    const sections = keysBetween(null, null, 501).map((orderKey, i) =>
      sectionRow(lesson.id, { orderKey, body: bodyOf(`${i}`) }),
    );
    await sync.pushOk(client, account, [upsert('lesson', lesson)]);
    for (let i = 0; i < sections.length; i += 100) {
      await sync.pushOk(
        client,
        account,
        sections.slice(i, i + 100).map((s) => upsert('section', s)),
      );
    }
    const first = await pull(0);
    expect(first).toMatchObject({ nextCursor: 500, hasMore: true, remaining: 502 });
    expect(first.rows).toHaveLength(500);
    expect((await pull(500)).rows).toHaveLength(2);
  });

  it('refuses a bad cursor or limit', async () => {
    for (const query of ['cursor=-1', 'cursor=x', 'cursor=0&limit=0', 'cursor=0&limit=501', '']) {
      const res = await client
        .get(`/api/sync/pull?${query}&clientVersion=0.0.0&${sync.PULL_DEVICE}`, account.token)
        .expect(400);
      expect(errorCode(res)).toBe('VALIDATION_FAILED');
    }
  });
});

/**
 * A conflicted copy (§6.4): the section and its copy are both written at rev 5, after the
 * lesson (1), the section (2), the laptop's edit of it (3) and a tag (4).
 */
async function conflictedCopy() {
  const lesson = lessonRow();
  const section = sectionRow(lesson.id, { body: bodyOf('base') });
  const tag = tagRow('hope');
  await sync.pushOk(client, account, [upsert('lesson', lesson), upsert('section', section)]);
  const laptop = { ...section, body: bodyOf('typed on the laptop'), updatedAt: LATER };
  await sync.pushOk(client, account, [
    upsert('section', laptop, 2, ['body', 'updatedAt']),
    upsert('tag', tag),
  ]);
  const phone = { ...section, body: bodyOf('typed on the phone'), updatedAt: NOW };
  const [result] = await sync.pushOk(client, account, [
    upsert('section', phone, 2, ['body', 'updatedAt']),
  ]);
  expect(result).toMatchObject({ resolution: 'conflicted-copy', rev: 5 });
  return { section, tag, copyId: (result as { copyId: string }).copyId };
}

describe('rows written at one rev', () => {
  it('are never split across pages', async () => {
    const { section, tag, copyId } = await conflictedCopy();
    const fromBefore = await pull(3, { limit: 2 });
    // The tag (rev 4) fits; the page stops before rev 5 rather than cut it.
    expect(ids(fromBefore.rows)).toEqual([`tag:${tag.id}`]);
    expect(fromBefore).toMatchObject({ nextCursor: 4, hasMore: true });
    // A rev larger than the limit comes whole.
    const atRev = await pull(4, { limit: 1 });
    expect(ids(atRev.rows).toSorted()).toEqual(
      [`section:${copyId}`, `section:${section.id}`].toSorted(),
    );
    expect(atRev.rows.map(({ row }) => row.rev)).toEqual([5, 5]);
    expect(atRev).toMatchObject({ nextCursor: 5, hasMore: true });
    expect(await pull(5, { limit: 1 })).toMatchObject({ rows: [], nextCursor: 5, hasMore: false });
  });

  it('come parents first', async () => {
    // A section added under a deleted lesson restores the lesson at the section's rev.
    const lesson = lessonRow();
    await sync.pushOk(client, account, [upsert('lesson', lesson), remove('lesson', lesson.id, 1)]);
    await sync.pushOk(client, account, [upsert('section', sectionRow(lesson.id))]);
    const { rows } = await pull(2);
    expect(
      rows.map(({ entity, row }) => [entity, row.rev, 'deletedAt' in row && row.deletedAt]),
    ).toEqual([
      ['lesson', 3, null],
      ['section', 3, null],
    ]);
  });
});

describe('the cursor never skips a row under concurrent pushes', () => {
  it('a page is one moment: rows pushed while it is read wait for the next pull', async () => {
    const lesson = lessonRow();
    await sync.pushOk(client, account, [upsert('lesson', lesson)]);
    const section = sectionRow(lesson.id);
    const tag = tagRow('hope');
    // Another device pushes a section (rev 2) and a tag (rev 3) after the pull has read the
    // sections and before it reads the tags. Without one snapshot, the page would hold the tag
    // and its cursor would pass the section.
    type Read = (
      this: PullService,
      tx: unknown,
      entity: string,
      query: unknown,
    ) => Promise<unknown>;
    const proto = PullService.prototype as unknown as { read: Read };
    const read = proto.read;
    let pushed = false;
    const spy = vi.spyOn(proto, 'read').mockImplementation(async function (
      this: PullService,
      tx,
      entity,
      query,
    ) {
      if (entity === 'tag' && !pushed) {
        pushed = true;
        await sync.pushOk(client, account, [upsert('section', section), upsert('tag', tag)]);
      }
      return read.call(this, tx, entity, query);
    });
    try {
      expect(await pull(1)).toMatchObject({ rows: [], nextCursor: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(pushed).toBe(true);
    expect(ids((await pull(1)).rows)).toEqual([`section:${section.id}`, `tag:${tag.id}`]);
  });

  it('under load, every row pushed is pulled', async () => {
    const lesson = lessonRow();
    await sync.pushOk(client, account, [upsert('lesson', lesson)]);
    // Three devices push to four tables at once while a fourth pulls with small pages.
    const keys = keysBetween(null, null, 3 * 15);
    const device = async (n: number) => {
      for (let i = 0; i < 15; i++) {
        const orderKey = keys[n * 15 + i];
        const section = sectionRow(lesson.id, { orderKey, body: bodyOf(`${n}.${i}`) });
        const tag = tagRow(`tag ${n}.${i}`);
        const takeaway: Row = { ...synced(), lessonId: lesson.id, text: `${n}.${i}` };
        const results = await sync.pushOk(client, account, [
          upsert('section', section),
          upsert('tag', tag),
          upsert('sectionTag', { ...synced(), tagId: tag.id, sectionId: section.id }),
          upsert('takeaway', takeaway),
        ]);
        expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied', 'applied']);
      }
    };
    const seen = new Map<string, number>();
    let cursor = 0;
    const take = (page: PullResponse) => {
      for (const { entity, row } of page.rows) {
        expect(row.rev).toBeGreaterThan(cursor);
        seen.set(`${entity}:${'id' in row ? row.id : ''}`, row.rev);
      }
      cursor = page.nextCursor;
    };
    const load = { pushing: true };
    const puller = (async () => {
      while (load.pushing) take(await pull(cursor, { limit: 7 }));
    })();
    await Promise.all([0, 1, 2].map(device));
    load.pushing = false;
    await puller;
    // Catch up on whatever was committed after the last page.
    for (let page = await pull(cursor); ; page = await pull(cursor)) {
      take(page);
      if (!page.hasMore) break;
    }

    const everything = (await pull(0)).rows;
    expect(everything).toHaveLength(1 + 3 * 15 * 4);
    expect(cursor).toBe(await syncRev());
    expect(
      new Map(
        everything.map(({ entity, row }) => [`${entity}:${'id' in row ? row.id : ''}`, row.rev]),
      ),
    ).toEqual(seen);
  });
});

describe('who may pull', () => {
  it('needs a session and a verified email', async () => {
    await client.get(`/api/sync/pull?cursor=0&clientVersion=0.0.0&${sync.PULL_DEVICE}`).expect(401);
    const unverified = await sync.signUp(t, client, { verified: false });
    const res = await pullRequest(0, { as: unverified }).expect(403);
    expect(errorCode(res)).toBe('EMAIL_NOT_VERIFIED');
  });

  it('answers 426 to an app older than the minimum, for pull and push alike', async () => {
    await sync.pushOk(client, account, [upsert('lesson', lessonRow())]);
    min.version = '1.2.0';
    const pulled = await pullRequest(0, { clientVersion: '1.1.9' }).expect(426);
    expect(apiErrorSchema.parse(pulled.body)).toMatchObject({
      errorCode: 'UPGRADE_REQUIRED',
      details: { minClientVersion: '1.2.0' },
    });
    const pushed = await sync.push(client, account, [upsert('lesson', lessonRow())]).expect(426);
    expect(errorCode(pushed)).toBe('UPGRADE_REQUIRED');
    expect(await syncRev()).toBe(1);

    const current = await pullRequest(0, { clientVersion: '1.2.0' }).expect(200);
    expect(pullResponseSchema.parse(current.body)).toMatchObject({ minClientVersion: '1.2.0' });
  });

  it('refuses a version that is not major.minor.patch', async () => {
    const res = await pullRequest(0, { clientVersion: 'latest' }).expect(400);
    expect(errorCode(res)).toBe('VALIDATION_FAILED');
    await client.get(`/api/sync/pull?cursor=0&${sync.PULL_DEVICE}`, account.token).expect(400);
  });
});
