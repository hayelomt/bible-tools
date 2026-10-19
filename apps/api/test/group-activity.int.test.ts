import {
  type GroupPulledRow,
  groupPullResponseSchema,
  groupVisitId,
  meResponseSchema,
  pullResponseSchema,
} from '@lamp/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DigestService, weekStart } from '../src/groups/digest.service.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { ownLesson, shared, twoInAGroup } from './int/groups.js';
import { type Client, createClient } from './int/http.js';
import { emailsTo } from './int/mail.js';
import {
  type Account,
  bodyOf,
  CLIENT_VERSION,
  commentRow,
  LATER,
  PULL_DEVICE,
  pushOk,
  questionRow,
  remove,
  signUp,
  synced,
  upsert,
} from './int/sync.js';

/**
 * A group's activity (F35, M13-11, M13-12, §17.12): when each row reached the group, each member's
 * visit, and the weekly email of what's new for them.
 */

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

const DAY = 24 * 60 * 60 * 1000;

const feed = async (account: Account, groupId: string, cursor = 0) =>
  groupPullResponseSchema.parse(
    (
      await client
        .get(
          `/api/groups/${groupId}/pull?cursor=${cursor}&clientVersion=${CLIENT_VERSION}`,
          account.token,
        )
        .expect(200)
    ).body,
  );

const added = (rows: GroupPulledRow[], id: string) =>
  rows.flatMap((r) => ('row' in r && r.row.id === id ? [r.addedRev] : []))[0];

const me = async (account: Account) =>
  meResponseSchema.parse((await client.get('/api/auth/me', account.token).expect(200)).body);

/** The weekly emails sent to the account: not the one asking to verify its address. */
const digestsTo = async (account: Account) => {
  const { email } = await t.prisma.user.findUniqueOrThrow({ where: { id: account.id } });
  return (await emailsTo(email)).filter((mail) => mail.subject?.startsWith('This week'));
};

/**
 * Ann's section in the group thread; Ben, who joined, replies to it, comments on it, asks a
 * question and shares a section of his own.
 */
async function busyWeek(g: Awaited<ReturnType<typeof twoInAGroup>>) {
  const annSection = shared(g.lesson.id, g.groupId, 'The door is the only way in.');
  await pushOk(client, g.ann, [upsert('section', annSection)]);
  const own = await ownLesson(g.ben, g.lesson);
  const reply = shared(own.id, g.groupId, 'Like Psalm 23.', { replyToId: annSection.id });
  const comment = commentRow(annSection.id, g.groupId, 'And John 10:9 too');
  const question = questionRow(own.id, { visibility: 'group', groupId: g.groupId });
  const aside = shared(own.id, g.groupId, 'A thought of my own.');
  await pushOk(client, g.ben, [
    upsert('lesson', own),
    upsert('section', reply),
    upsert('comment', comment),
    upsert('question', question),
    upsert('section', aside),
  ]);
  return { annSection, own, reply, comment, question, aside };
}

describe('the feed', () => {
  it('says when each row reached the group, and an edit keeps it', async () => {
    const g = await twoInAGroup(t, client);
    const { annSection, reply, comment } = await busyWeek(g);
    const first = await feed(g.ann, g.groupId);
    const replyAdded = added(first.rows, reply.id)!;
    expect(replyAdded).toBeGreaterThan(added(first.rows, annSection.id)!);
    expect(added(first.rows, comment.id)).toBeGreaterThanOrEqual(replyAdded);

    await pushOk(client, g.ben, [
      upsert('section', { ...reply, body: bodyOf('Like Psalm 23:1.'), updatedAt: LATER }, 1),
    ]);
    const next = await feed(g.ann, g.groupId, first.nextCursor);
    expect(next.nextCursor).toBeGreaterThan(first.nextCursor);
    expect(added(next.rows, reply.id)).toBe(replyAdded);
  });

  it("a member's visit is their own synced row, its id from the pair", async () => {
    const g = await twoInAGroup(t, client);
    const visit = {
      ...synced(),
      id: await groupVisitId(g.ben.id, g.groupId),
      groupId: g.groupId,
      seenRev: 7,
    };
    const [result] = await pushOk(client, g.ben, [upsert('groupVisit', visit)]);
    expect(result).toMatchObject({ status: 'applied' });
    const pulled = pullResponseSchema.parse(
      (
        await client
          .get(
            `/api/sync/pull?cursor=0&${PULL_DEVICE}&clientVersion=${CLIENT_VERSION}`,
            g.ben.token,
          )
          .expect(200)
      ).body,
    );
    expect(pulled.rows.filter((r) => r.entity === 'groupVisit').map((r) => r.row)).toEqual([
      expect.objectContaining({ id: visit.id, seenRev: 7 }),
    ]);
    // Ann's devices never see it.
    const theirs = pullResponseSchema.parse(
      (
        await client
          .get(
            `/api/sync/pull?cursor=0&${PULL_DEVICE}&clientVersion=${CLIENT_VERSION}`,
            g.ann.token,
          )
          .expect(200)
      ).body,
    );
    expect(theirs.rows.filter((r) => r.entity === 'groupVisit')).toEqual([]);
  });
});

describe('the weekly email', () => {
  it('is off until turned on, and only for a verified address', async () => {
    const ann = await signUp(t, client);
    expect((await me(ann)).groupDigest).toBe(false);
    await client.put('/api/account/group-digest', { on: true }, ann.token).expect(204);
    expect((await me(ann)).groupDigest).toBe(true);
    await client.put('/api/account/group-digest', { on: false }, ann.token).expect(204);
    expect((await me(ann)).groupDigest).toBe(false);

    const unverified = await signUp(t, client, { verified: false });
    await client.put('/api/account/group-digest', { on: true }, unverified.token).expect(403);
  });

  it("lists the week's replies, comments and questions for each member who wants it", async () => {
    const base = Date.now();
    const g = await twoInAGroup(t, client);
    await client.put('/api/account/group-digest', { on: true }, g.ann.token).expect(204);
    const { annSection } = await busyWeek(g);
    // A comment deleted before the email isn't in it.
    const gone = commentRow(annSection.id, g.groupId, 'Never mind');
    const [made] = await pushOk(client, g.ben, [upsert('comment', gone)]);
    await pushOk(client, g.ben, [remove('comment', gone.id, (made as { rev: number }).rev)]);

    const digests = t.app.get(DigestService);
    const nextWeek = new Date(base + 7 * DAY);
    expect(await digests.sendDue(nextWeek)).toBe(1);
    const [mail, ...more] = await digestsTo(g.ann);
    expect(more).toEqual([]);
    expect(mail!.subject).toBe('This week in Thursday group');
    const lines = (mail!.text ?? '').split('\n').filter((l) => l.startsWith('- '));
    expect(lines.toSorted()).toEqual([
      '- Ben asked “Who are the other sheep?” in The Good Shepherd',
      '- Ben commented on your section in The Good Shepherd',
      '- Ben replied to your section in The Good Shepherd',
    ]);
    expect(mail!.text).toContain(`/groups/${g.groupId}`);
    expect(mail!.headerLines.map((h) => h.line)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^List-Unsubscribe: <http.+\/api\/email\/unsubscribe\?token=.+>$/),
        'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
      ]),
    );
    // Ben has it off: nothing for him.
    expect(await digestsTo(g.ben)).toEqual([]);

    // Once a week: again the same week sends nothing; a quiet week sends nothing either.
    expect(await digests.sendDue(new Date(nextWeek.getTime() + 2 * 60 * 60 * 1000))).toBe(0);
    expect(await digests.sendDue(new Date(weekStart(nextWeek).getTime() + 7 * DAY))).toBe(0);
    expect(await digestsTo(g.ann)).toHaveLength(1);

    // Its link turns it off, signed out; a token that wasn't made here doesn't.
    const token = /\/unsubscribe\?token=([^\s]+)/.exec(mail!.text ?? '')?.[1];
    expect(token).toBeDefined();
    const [userId, mac] = decodeURIComponent(token!).split('.');
    await client.post(`/api/email/unsubscribe?token=${g.ben.id}.${mac}`, {}).expect(404);
    expect((await me(g.ann)).groupDigest).toBe(true);
    expect(userId).toBe(g.ann.id);
    // As a mail app's one-click sends it: a form body, from no page of ours.
    await request(client.origin)
      .post(`/api/email/unsubscribe?token=${token}`)
      .type('form')
      .send('List-Unsubscribe=One-Click')
      .expect(204);
    expect((await me(g.ann)).groupDigest).toBe(false);
  });

  it('goes to no one who left, is disabled or unverified', async () => {
    const base = Date.now();
    const g = await twoInAGroup(t, client);
    await client.put('/api/account/group-digest', { on: true }, g.ann.token).expect(204);
    await busyWeek(g);
    await t.prisma.user.update({ where: { id: g.ann.id }, data: { emailVerifiedAt: null } });
    const digests = t.app.get(DigestService);
    expect(await digests.sendDue(new Date(base + 7 * DAY))).toBe(0);
    await t.prisma.user.update({
      where: { id: g.ann.id },
      data: { emailVerifiedAt: new Date(), disabledAt: new Date() },
    });
    expect(await digests.sendDue(new Date(base + 7 * DAY))).toBe(0);
    expect(await digestsTo(g.ann)).toEqual([]);
  });
});
