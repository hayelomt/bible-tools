import {
  apiErrorSchema,
  groupIdResponseSchema,
  type GroupPulledRow,
  groupPullResponseSchema,
  invitePreviewSchema,
  inviteResponseSchema,
  MAX_GROUP_MEMBERS,
  pullResponseSchema,
} from '@lamp/domain';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashToken } from '../src/auth/tokens.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import {
  type Account,
  CLIENT_VERSION,
  LATER,
  lessonRow,
  PULL_DEVICE,
  pushOk,
  remove,
  type Row,
  sectionRow,
  signUp,
  synced,
  upsert,
} from './int/sync.js';

/** Groups, members, invites and the group feed (F35, M13-07, §17.12). */

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

const seriesRow = (title: string): Row => ({
  ...synced(),
  title,
  description: '',
  kind: 'book_study',
});

/** An account with a series of two lessons, synced. */
async function withSeries(title = 'John') {
  const account = await signUp(t, client);
  const series = seriesRow(title);
  const lessons = [
    lessonRow({ title: 'The Good Shepherd', seriesId: series.id }),
    lessonRow({ title: 'Lazarus', seriesId: series.id, date: '2026-10-11' }),
  ];
  await pushOk(client, account, [
    upsert('series', series),
    ...lessons.map((lesson) => upsert('lesson', lesson)),
  ]);
  return { account, series, lessons };
}

async function createGroup(account: Account, seriesId: string, name = 'Thursday group') {
  const res = await client
    .post('/api/groups', { name, seriesId, displayName: 'Ann' }, account.token)
    .expect(201);
  return groupIdResponseSchema.parse(res.body).groupId;
}

const inviteUrl = async (account: Account, groupId: string) =>
  inviteResponseSchema.parse(
    (await client.get(`/api/groups/${groupId}/invite`, account.token).expect(200)).body,
  ).url;

const tokenOf = (url: string) => new URL(url).searchParams.get('token') ?? '';

function join(account: Account, token: string, displayName = 'Ben') {
  return client.post('/api/invites/join', { token, displayName }, account.token);
}

/** A group with the owner and one member who joined by its invite. */
async function twoMembers() {
  const owner = await withSeries();
  const groupId = await createGroup(owner.account, owner.series.id);
  const member = await signUp(t, client);
  await join(member, tokenOf(await inviteUrl(owner.account, groupId))).expect(200);
  return { ...owner, owner: owner.account, member, groupId };
}

const groupPull = (account: Account, groupId: string, cursor = 0, limit = 500) =>
  client.get(
    `/api/groups/${groupId}/pull?cursor=${cursor}&limit=${limit}&clientVersion=${CLIENT_VERSION}`,
    account.token,
  );

const pullOk = async (account: Account, groupId: string, cursor = 0, limit = 500) =>
  groupPullResponseSchema.parse(
    (await groupPull(account, groupId, cursor, limit).expect(200)).body,
  );

const userPull = async (account: Account) =>
  pullResponseSchema.parse(
    (
      await client
        .get(
          `/api/sync/pull?cursor=0&${PULL_DEVICE}&clientVersion=${CLIENT_VERSION}`,
          account.token,
        )
        .expect(200)
    ).body,
  );

/** What the feed holds, as `entity:id` keys of live rows and of gone ones. */
function keys(rows: GroupPulledRow[]) {
  const live: string[] = [];
  const gone: string[] = [];
  for (const row of rows) {
    if ('gone' in row) gone.push(`${row.entity}:${row.id}`);
    else live.push(`${row.entity}:${row.row.id}`);
  }
  return { live: live.toSorted(), gone: gone.toSorted() };
}

const rowOf = <E extends GroupPulledRow['entity']>(rows: GroupPulledRow[], entity: E, id: string) =>
  rows.find((r) => r.entity === entity && !('gone' in r) && r.row.id === id) as
    Extract<GroupPulledRow, { entity: E; row: unknown }> | undefined;

async function memberIds(groupId: string) {
  const members = await t.prisma.groupMember.findMany({ where: { groupId } });
  return Object.fromEntries(members.map((m) => [m.userId, m]));
}

describe('POST /api/groups', () => {
  it("makes a group around the caller's series, with them as owner, in its feed", async () => {
    const { account, series, lessons } = await withSeries();
    const groupId = await createGroup(account, series.id);

    const page = await pullOk(account, groupId);
    const member = (await memberIds(groupId))[account.id]!;
    expect(keys(page.rows)).toEqual({
      live: [
        `group:${groupId}`,
        ...lessons.map((l) => `lesson:${l.id}`),
        `member:${member.id}`,
        `series:${series.id}`,
      ].toSorted(),
      gone: [],
    });
    // One rev, parents first.
    expect(page.rows.map((r) => r.entity)).toEqual([
      'group',
      'member',
      'series',
      'lesson',
      'lesson',
    ]);
    expect(page).toMatchObject({ nextCursor: 1, hasMore: false, remaining: 5 });
    expect(rowOf(page.rows, 'group', groupId)?.row).toMatchObject({ name: 'Thursday group' });
    expect(rowOf(page.rows, 'member', member.id)?.row).toEqual({
      id: member.id,
      userId: account.id,
      displayName: 'Ann',
      role: 'owner',
      joinedAt: member.joinedAt.toISOString(),
    });
    // A projection: the lesson's details and its owner, nothing else.
    expect(rowOf(page.rows, 'lesson', lessons[0]!.id)?.row).toEqual({
      ...lessons[0],
      userId: account.id,
      createdAt: lessons[0]!.createdAt,
      updatedAt: lessons[0]!.updatedAt,
      deletedAt: undefined,
      groupLessonId: undefined,
    });

    const pulled = await userPull(account);
    expect(pulled.groups).toEqual([{ id: groupId, rev: 1 }]);
  });

  it('needs a verified email, and a live series of the caller’s, in no other group', async () => {
    const { account, series } = await withSeries();
    const unverified = await signUp(t, client, { verified: false });
    const body = { name: 'Group', seriesId: series.id, displayName: 'Ann' };
    expect(errorCode(await client.post('/api/groups', body, unverified.token).expect(403))).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    const other = await signUp(t, client);
    await client.post('/api/groups', body, other.token).expect(404);

    await createGroup(account, series.id);
    const again = await client.post('/api/groups', body, account.token).expect(409);
    expect(errorCode(again)).toBe('IN_GROUP');
    await expect(t.prisma.group.count()).resolves.toBe(1);

    await pushOk(client, account, [remove('series', series.id, 0)]);
    const gone = seriesRow('Gone');
    await pushOk(client, account, [upsert('series', gone), remove('series', gone.id, 0)]);
    await client.post('/api/groups', { ...body, seriesId: gone.id }, account.token).expect(404);
  });
});

describe('invites and joining', () => {
  it('shows the group to anyone with the invite, and lets a signed-in user join once', async () => {
    const { account, series, lessons } = await withSeries();
    const groupId = await createGroup(account, series.id);
    const url = await inviteUrl(account, groupId);
    expect(url).toMatch(/\/join\?token=[A-Za-z0-9_-]{43}$/);
    const token = tokenOf(url);
    // Only the hash is stored.
    const stored = await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    expect(stored.inviteTokenHash).toBe(hashToken(token));

    const preview = await client.post('/api/invites/preview', { token }).expect(200);
    expect(invitePreviewSchema.parse(preview.body)).toEqual({
      groupId,
      name: 'Thursday group',
      ownerName: 'Ann',
      series: ['John'],
      members: 1,
    });

    await client.post('/api/invites/join', { token, displayName: 'Ben' }).expect(401);
    const member = await signUp(t, client);
    const joined = await join(member, token).expect(200);
    expect(groupIdResponseSchema.parse(joined.body).groupId).toBe(groupId);
    expect(errorCode(await join(member, token).expect(409))).toBe('ALREADY_MEMBER');

    // The member reads the group, its members, the series and its lessons.
    const page = await pullOk(member, groupId);
    const members = await memberIds(groupId);
    expect(keys(page.rows).live).toEqual(
      [
        `group:${groupId}`,
        `member:${members[account.id]!.id}`,
        `member:${members[member.id]!.id}`,
        `series:${series.id}`,
        ...lessons.map((l) => `lesson:${l.id}`),
      ].toSorted(),
    );
    expect(rowOf(page.rows, 'member', members[member.id]!.id)?.row).toMatchObject({
      displayName: 'Ben',
      role: 'member',
    });
    expect((await userPull(member)).groups).toEqual([{ id: groupId, rev: 2 }]);
  });

  it('only the owner sees the invite; a new one turns the old one off', async () => {
    const { owner, member, groupId } = await twoMembers();
    expect(
      errorCode(await client.get(`/api/groups/${groupId}/invite`, member.token).expect(403)),
    ).toBe('NOT_GROUP_OWNER');
    const old = tokenOf(await inviteUrl(owner, groupId));
    const fresh = inviteResponseSchema.parse(
      (await client.post(`/api/groups/${groupId}/invite`, {}, owner.token).expect(200)).body,
    ).url;
    expect(tokenOf(fresh)).not.toBe(old);
    expect(await inviteUrl(owner, groupId)).toBe(fresh);

    await client.post('/api/invites/preview', { token: old }).expect(404);
    const third = await signUp(t, client);
    await join(third, old).expect(404);
    await join(third, tokenOf(fresh), 'Cara').expect(200);
  });

  it('turns away a full group, and a mistyped token', async () => {
    const { owner, groupId } = await twoMembers();
    const token = tokenOf(await inviteUrl(owner, groupId));
    for (let i = 2; i < MAX_GROUP_MEMBERS; i++) {
      const user = await t.prisma.user.create({
        data: { email: `member${i}@example.com`, passwordHash: 'x' },
      });
      await t.prisma.groupMember.create({
        data: { groupId, userId: user.id, role: 'member', displayName: `Member ${i}` },
      });
    }
    const late = await signUp(t, client);
    expect(errorCode(await join(late, token).expect(409))).toBe('GROUP_FULL');
    await client.post('/api/invites/preview', { token: 'x'.repeat(43) }).expect(404);
    await client.post('/api/invites/preview', { token: 'short' }).expect(400);
  });
});

describe('the group feed', () => {
  it("is the members' only: anyone else gets 404, and an old app 426", async () => {
    const { groupId } = await twoMembers();
    const outsider = await signUp(t, client);
    expect(errorCode(await groupPull(outsider, groupId).expect(404))).toBe('NOT_FOUND');
    await groupPull(outsider, '0199e0a0-0000-7000-8000-00000000abcd').expect(404);
    expect((await userPull(outsider)).groups).toEqual([]);
    await client
      .get(`/api/groups/${groupId}/pull?cursor=0&clientVersion=0.0.1`, outsider.token)
      .expect(426);
  });

  it("follows the owner's pushes to the series' lessons, and never shows their notes", async () => {
    const { owner, member, groupId, series, lessons } = await twoMembers();
    const start = await pullOk(member, groupId);

    const renamed = { ...lessons[0]!, title: 'I am the door', updatedAt: LATER };
    const added = lessonRow({ title: 'The vine', seriesId: series.id });
    const elsewhere = lessonRow({ title: 'Not in John' });
    const note = sectionRow(lessons[0]!.id);
    await pushOk(client, owner, [
      upsert('lesson', renamed, 1),
      upsert('lesson', added),
      upsert('lesson', elsewhere),
      upsert('section', note),
      upsert('takeaway', { ...synced(), lessonId: lessons[0]!.id, text: 'Private' }),
    ]);

    const next = await pullOk(member, groupId, start.nextCursor);
    expect(keys(next.rows)).toEqual({
      live: [`lesson:${lessons[0]!.id}`, `lesson:${added.id}`].toSorted(),
      gone: [],
    });
    expect(rowOf(next.rows, 'lesson', lessons[0]!.id)?.row.title).toBe('I am the door');

    // A deleted lesson goes; restored, it comes back.
    const { rev } = await t.prisma.lesson.findUniqueOrThrow({ where: { id: added.id } });
    await pushOk(client, owner, [remove('lesson', added.id, Number(rev))]);
    const deleted = await pullOk(member, groupId, next.nextCursor);
    expect(keys(deleted.rows)).toEqual({ live: [], gone: [`lesson:${added.id}`] });
    const restoredNote = sectionRow(added.id, { updatedAt: '2026-10-13T12:00:00.000Z' });
    await pushOk(client, owner, [upsert('section', restoredNote)]);
    const restored = await pullOk(member, groupId, deleted.nextCursor);
    expect(keys(restored.rows)).toEqual({ live: [`lesson:${added.id}`], gone: [] });

    // From the start, what's gone isn't sent at all.
    const fresh = await pullOk(member, groupId);
    expect(fresh.rows.some((r) => 'gone' in r)).toBe(false);
  });

  it("refuses to move a shared series' lesson out, or to delete the series", async () => {
    const { owner, series, lessons } = await twoMembers();
    const [moved, deleted] = await pushOk(client, owner, [
      upsert('lesson', { ...lessons[0]!, seriesId: null, updatedAt: LATER }, 1),
      remove('series', series.id, 1),
    ]);
    expect(moved).toMatchObject({ status: 'rejected', errorCode: 'IN_GROUP' });
    expect(deleted).toMatchObject({ status: 'rejected', errorCode: 'IN_GROUP' });
  });

  it('pages whole revs, and a later page carries only what changed', async () => {
    const { owner, member, groupId } = await twoMembers();
    const first = await pullOk(member, groupId, 0, 2);
    // The group's first rev holds five rows: a page never splits it.
    expect(first.rows).toHaveLength(5);
    expect(first).toMatchObject({ nextCursor: 1, hasMore: true, remaining: 6 });
    const second = await pullOk(member, groupId, first.nextCursor, 2);
    expect(second.rows.map((r) => r.entity)).toEqual(['member']);
    expect(second).toMatchObject({ nextCursor: 2, hasMore: false, remaining: 1 });

    await client.patch(`/api/groups/${groupId}`, { name: 'Friday group' }, owner.token).expect(204);
    const renamed = await pullOk(member, groupId, second.nextCursor);
    expect(rowOf(renamed.rows, 'group', groupId)?.row.name).toBe('Friday group');
    expect(renamed.rows).toHaveLength(1);
  });
});

describe('membership', () => {
  it('only the owner renames, removes, hands over and adds series', async () => {
    const { member, groupId, owner } = await twoMembers();
    const theirs = seriesRow('Romans');
    await pushOk(client, member, [upsert('series', theirs)]);
    const calls = [
      client.patch(`/api/groups/${groupId}`, { name: 'Mine' }, member.token),
      client.delete(`/api/groups/${groupId}/members/${owner.id}`, {}, member.token),
      client.post(`/api/groups/${groupId}/owner`, { userId: member.id }, member.token),
      client.post(`/api/groups/${groupId}/series`, { seriesId: theirs.id }, member.token),
      client.post(`/api/groups/${groupId}/invite`, {}, member.token),
    ];
    for (const call of calls) expect(errorCode(await call.expect(403))).toBe('NOT_GROUP_OWNER');
    const outsider = await signUp(t, client);
    await client.patch(`/api/groups/${groupId}`, { name: 'Mine' }, outsider.token).expect(404);
  });

  it('adds and removes a series, its lessons with it', async () => {
    const { owner, member, groupId } = await twoMembers();
    const romans = seriesRow('Romans');
    const lesson = lessonRow({ seriesId: romans.id });
    await pushOk(client, owner, [upsert('series', romans), upsert('lesson', lesson)]);
    const start = await pullOk(member, groupId);

    await client
      .post(`/api/groups/${groupId}/series`, { seriesId: romans.id }, owner.token)
      .expect(204);
    const added = await pullOk(member, groupId, start.nextCursor);
    expect(keys(added.rows).live).toEqual([`lesson:${lesson.id}`, `series:${romans.id}`]);

    await client.delete(`/api/groups/${groupId}/series/${romans.id}`, {}, owner.token).expect(204);
    const removed = await pullOk(member, groupId, added.nextCursor);
    expect(keys(removed.rows)).toEqual({
      live: [],
      gone: [`lesson:${lesson.id}`, `series:${romans.id}`],
    });
    await client.delete(`/api/groups/${groupId}/series/${romans.id}`, {}, owner.token).expect(404);
  });

  it('a removed member loses the group at their next sync', async () => {
    const { owner, member, groupId } = await twoMembers();
    const start = await pullOk(owner, groupId);
    const membership = (await memberIds(groupId))[member.id]!;

    await client.delete(`/api/groups/${groupId}/members/${member.id}`, {}, owner.token).expect(204);
    expect((await userPull(member)).groups).toEqual([]);
    await groupPull(member, groupId).expect(404);
    await join(member, 'x'.repeat(43)).expect(404);
    const after = await pullOk(owner, groupId, start.nextCursor);
    expect(keys(after.rows)).toEqual({ live: [], gone: [`member:${membership.id}`] });
    await client.delete(`/api/groups/${groupId}/members/${member.id}`, {}, owner.token).expect(404);
    await client.delete(`/api/groups/${groupId}/members/${owner.id}`, {}, owner.token).expect(404);
  });

  it('hands ownership over, and a member who leaves takes their series', async () => {
    const { owner, member, groupId, series } = await twoMembers();
    const members = await memberIds(groupId);
    expect(
      errorCode(await client.post(`/api/groups/${groupId}/leave`, {}, owner.token).expect(409)),
    ).toBe('OWNER_MUST_HAND_OVER');

    await client
      .post(`/api/groups/${groupId}/owner`, { userId: member.id }, owner.token)
      .expect(204);
    const roles = await memberIds(groupId);
    expect([roles[owner.id]!.role, roles[member.id]!.role]).toEqual(['member', 'owner']);
    const start = await pullOk(member, groupId);

    // The old owner, now a member, leaves; John was theirs, so it leaves with them.
    await client.post(`/api/groups/${groupId}/leave`, {}, owner.token).expect(204);
    const after = await pullOk(member, groupId, start.nextCursor);
    const lessonIds = (
      await t.prisma.lesson.findMany({ where: { seriesId: series.id }, select: { id: true } })
    ).map((l) => `lesson:${l.id}`);
    expect(keys(after.rows)).toEqual({
      live: [],
      gone: [`member:${members[owner.id]!.id}`, `series:${series.id}`, ...lessonIds].toSorted(),
    });
    await expect(t.prisma.groupSeries.count()).resolves.toBe(0);

    // The last member leaving deletes the group.
    await client.post(`/api/groups/${groupId}/leave`, {}, member.token).expect(204);
    await expect(t.prisma.group.count()).resolves.toBe(0);
    await expect(t.prisma.groupFeed.count()).resolves.toBe(0);
  });

  it("deleting the owner's account passes the group to the member who joined first", async () => {
    const { owner, member, groupId } = await twoMembers();
    const third = await signUp(t, client);
    await join(third, tokenOf(await inviteUrl(owner, groupId)), 'Cara').expect(200);

    await client.delete('/api/account', { password: 'a lamp to my feet' }, owner.token).expect(204);
    const members = await t.prisma.groupMember.findMany({ where: { groupId } });
    expect(members.map((m) => [m.userId, m.role]).toSorted()).toEqual(
      [
        [member.id, 'owner'],
        [third.id, 'member'],
      ].toSorted(),
    );
    const page = await pullOk(third, groupId);
    expect(page.rows.map((r) => r.entity)).toEqual(['group', 'member', 'member']);
  });
});
