import { apiErrorSchema, shareLinkSchema, shareLinksResponseSchema } from '@lamp/domain';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import { HANDOUT } from './int/share.js';
import {
  type Account,
  LATER,
  lessonRow,
  pushOk,
  remove,
  signUp,
  synced,
  upsert,
} from './int/sync.js';

/** `POST`, `GET` and `DELETE /api/share-links` (F34, M13-01, §17.10). */

let t: TestApp;
let client: Client;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
  client = await createClient(t);
});

const errorCode = (res: request.Response): string => apiErrorSchema.parse(res.body).errorCode;

const DAY = 24 * 60 * 60 * 1000;
const inDays = (days: number) => new Date(Date.now() + days * DAY).toISOString();

/** An account with a lesson in a series, synced. */
async function owner() {
  const account = await signUp(t, client);
  const series = { ...synced(), title: 'John', description: '', kind: 'book_study' };
  const lesson = lessonRow({ title: 'The Good Shepherd', seriesId: series.id });
  await pushOk(client, account, [upsert('series', series), upsert('lesson', lesson)]);
  return { account, series, lesson };
}

const create = (account: Account | undefined, body: object) =>
  client.post('/api/share-links', body, account?.token);

const createOk = async (account: Account, body: object) =>
  shareLinkSchema.parse((await create(account, body).expect(201)).body);

const list = async (account: Account) =>
  shareLinksResponseSchema.parse(
    (await client.get('/api/share-links', account.token).expect(200)).body,
  ).links;

const tokenOf = (url: string) => new URL(url).pathname.replace('/s/', '');

describe('POST /api/share-links', () => {
  it('needs a session', async () => {
    const res = await create(undefined, {
      targetType: 'compile',
      passage: { book: 'ROM', chapter: 8 },
      live: true,
      expiresAt: null,
    }).expect(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('makes an unguessable link to a lesson, storing only its token hash', async () => {
    const { account, lesson } = await owner();
    const link = await createOk(account, {
      targetType: 'lesson',
      targetId: lesson.id,
      expiresAt: null,
    });
    expect(link).toMatchObject({
      targetType: 'lesson',
      targetId: lesson.id,
      passage: null,
      title: 'The Good Shepherd',
      live: true,
      gone: false,
      expiresAt: null,
      lastOpenedAt: null,
    });
    expect(link.url).toMatch(/^http:\/\/localhost:5173\/s\/[A-Za-z0-9_-]{43}$/);
    const stored = await t.prisma.shareLink.findUniqueOrThrow({ where: { id: link.id } });
    expect(stored.tokenHash).toBe(hashToken(tokenOf(link.url)));
    expect(JSON.stringify(stored)).not.toContain(tokenOf(link.url));
  });

  it('links a series, and a compile view frozen or live', async () => {
    const { account, series } = await owner();
    const seriesLink = await createOk(account, {
      targetType: 'series',
      targetId: series.id,
      expiresAt: inDays(7),
    });
    expect(seriesLink).toMatchObject({ title: 'John', live: true });
    const frozen = await createOk(account, {
      targetType: 'compile',
      passage: { book: 'ROM', chapter: 8 },
      live: false,
      expiresAt: null,
    });
    expect(frozen).toMatchObject({ targetId: null, title: 'Romans 8', live: false });
    const stored = await t.prisma.shareLink.findUniqueOrThrow({ where: { id: frozen.id } });
    expect(stored.snapshot).toMatchObject({ title: 'Romans 8', sections: 0, groups: [] });
    const live = await createOk(account, {
      targetType: 'compile',
      passage: { book: 'JHN', chapter: 1, chapterEnd: 21 },
      live: true,
      expiresAt: null,
    });
    expect(live).toMatchObject({ title: 'John', live: true });
  });

  it("refuses another account's lesson or series, and a deleted one", async () => {
    const theirs = await owner();
    const mine = await owner();
    for (const body of [
      { targetType: 'lesson', targetId: theirs.lesson.id, expiresAt: null },
      { targetType: 'series', targetId: theirs.series.id, expiresAt: null },
    ]) {
      expect(errorCode(await create(mine.account, body).expect(404))).toBe('NOT_FOUND');
    }
    await pushOk(client, mine.account, [remove('lesson', mine.lesson.id, 2)]);
    const res = await create(mine.account, {
      targetType: 'lesson',
      targetId: mine.lesson.id,
      expiresAt: null,
    }).expect(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
    await expect(t.prisma.shareLink.count()).resolves.toBe(0);
  });

  it('makes one working link per target', async () => {
    const { account, lesson } = await owner();
    const body = { targetType: 'lesson', targetId: lesson.id, expiresAt: null };
    const first = await createOk(account, body);
    const res = await create(account, body).expect(409);
    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      errorCode: 'SHARE_LINK_EXISTS',
      details: { id: first.id },
    });
    // A handout of the same lesson is a target of its own.
    await createOk(account, { ...body, targetType: 'handout', handout: HANDOUT });
    // Once revoked, there can be a new one, at a new address.
    await client.delete(`/api/share-links/${first.id}`, undefined, account.token).expect(204);
    const second = await createOk(account, body);
    expect(second.url).not.toBe(first.url);
  });

  it('refuses an expiry that has passed', async () => {
    const { account, lesson } = await owner();
    const res = await create(account, {
      targetType: 'lesson',
      targetId: lesson.id,
      expiresAt: inDays(-1),
    }).expect(400);
    expect(errorCode(res)).toBe('EXPIRY_PASSED');
  });

  it('checks a handout as the device sends it', async () => {
    const { account, lesson } = await owner();
    const res = await create(account, {
      targetType: 'handout',
      targetId: lesson.id,
      handout: { ...HANDOUT, notes: 'not a list' },
      expiresAt: null,
    }).expect(400);
    expect(errorCode(res)).toBe('VALIDATION_FAILED');
  });
});

describe('GET /api/share-links', () => {
  it("lists the owner's links newest first, expired ones too, revoked ones not", async () => {
    const { account, lesson, series } = await owner();
    const lessonLink = await createOk(account, {
      targetType: 'lesson',
      targetId: lesson.id,
      expiresAt: null,
    });
    const seriesLink = await createOk(account, {
      targetType: 'series',
      targetId: series.id,
      expiresAt: inDays(1),
    });
    const handoutLink = await createOk(account, {
      targetType: 'handout',
      targetId: lesson.id,
      handout: HANDOUT,
      expiresAt: null,
    });
    await t.prisma.shareLink.update({
      where: { id: seriesLink.id },
      data: { expiresAt: new Date(Date.now() - DAY) },
    });
    await client.delete(`/api/share-links/${handoutLink.id}`, undefined, account.token).expect(204);
    const links = await list(account);
    expect(links.map((l) => l.id)).toEqual([seriesLink.id, lessonLink.id]);
    // The address is the same each time it's listed.
    expect(links[1]!.url).toBe(lessonLink.url);
  });

  it("shows a deleted target's last title, as gone", async () => {
    const { account, lesson } = await owner();
    await createOk(account, { targetType: 'lesson', targetId: lesson.id, expiresAt: null });
    await pushOk(client, account, [remove('lesson', lesson.id, 2, LATER)]);
    expect(await list(account)).toMatchObject([{ title: 'The Good Shepherd', gone: true }]);
  });

  it("never shows another account's links", async () => {
    const theirs = await owner();
    await createOk(theirs.account, {
      targetType: 'lesson',
      targetId: theirs.lesson.id,
      expiresAt: null,
    });
    const mine = await owner();
    expect(await list(mine.account)).toEqual([]);
  });
});

describe('DELETE /api/share-links/:id', () => {
  it("can't revoke another account's link, and leaves it working", async () => {
    const theirs = await owner();
    const link = await createOk(theirs.account, {
      targetType: 'lesson',
      targetId: theirs.lesson.id,
      expiresAt: null,
    });
    const mine = await owner();
    const res = await client
      .delete(`/api/share-links/${link.id}`, undefined, mine.account.token)
      .expect(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
    expect((await client.get(new URL(link.url).pathname)).status).toBe(200);
  });

  it('turns the link off: its page answers 404', async () => {
    const { account, lesson } = await owner();
    const link = await createOk(account, {
      targetType: 'lesson',
      targetId: lesson.id,
      expiresAt: null,
    });
    const path = new URL(link.url).pathname;
    expect((await client.get(path)).status).toBe(200);
    await client.delete(`/api/share-links/${link.id}`, undefined, account.token).expect(204);
    expect((await client.get(path)).status).toBe(404);
    // Revoking again finds nothing.
    await client.delete(`/api/share-links/${link.id}`, undefined, account.token).expect(404);
  });

  it('an expired link answers 404 too', async () => {
    const { account, lesson } = await owner();
    const link = await createOk(account, {
      targetType: 'lesson',
      targetId: lesson.id,
      expiresAt: inDays(1),
    });
    const path = new URL(link.url).pathname;
    expect((await client.get(path)).status).toBe(200);
    await t.prisma.shareLink.update({
      where: { id: link.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect((await client.get(path)).status).toBe(404);
  });
});
