import {
  apiErrorSchema,
  devicesResponseSchema,
  groupIdResponseSchema,
  groupPullResponseSchema,
  inviteResponseSchema,
  type EntityName,
  meResponseSchema,
  newId,
  NOT_IN_GROUP,
  ownLessonId,
  pullResponseSchema,
  shareLinksResponseSchema,
} from '@lamp/domain';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import { ENTITY_TABLES, type RowEntity } from '../src/sync/entity-tables.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient, sessionCookie } from './int/http.js';
import { runEmail } from './int/mail.js';
import {
  type Account,
  bodyLinking,
  CLIENT_VERSION,
  commentRow,
  questionRow,
  DEVICE_ID,
  JOHN_3_16,
  LATER,
  lessonRow,
  NOW,
  PULL_DEVICE,
  pushOk,
  type Row,
  remove,
  sectionRow,
  synced,
  tagRow,
  upsert,
} from './int/sync.js';

/**
 * Isolation (§12): one account can never read, overwrite, reference or delete another account's
 * rows through any endpoint. Their account fills every table through the API; mine then tries
 * each way in, and every table of theirs is compared before and after.
 */

let t: TestApp;
let client: Client;

const PASSWORD = 'a lamp to my feet';
const ROW_ENTITIES = Object.keys(ENTITY_TABLES) as RowEntity[];

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

interface Signed extends Account {
  email: string;
}

async function signUp(): Promise<Signed> {
  const email = runEmail('isolation');
  const res = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  const id = (res.body as { id: string }).id;
  await t.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  return { id, email, token: sessionCookie(res)?.token ?? '' };
}

type Rows = Partial<Record<RowEntity, Row>>;

/** A new row of the entity whose references point at `to`'s rows of that kind, or null. */
function rowOf(entity: RowEntity, to: Rows): Row {
  const refs = Object.fromEntries(
    Object.entries(ENTITY_TABLES[entity].refs).map(([column, target]) => [
      column,
      to[target]?.id ?? null,
    ]),
  );
  switch (entity) {
    case 'series':
      return { ...synced(), title: 'Romans', description: '', kind: 'sermon_series' };
    case 'lesson':
      return lessonRow(refs);
    case 'section':
      // A link to its own lesson, so the derived link table has a row too.
      return sectionRow(refs.lessonId as string, {
        body: bodyLinking('lesson', refs.lessonId as string),
        ...refs,
      });
    case 'tag':
      return tagRow('grace');
    case 'highlight':
      return { ...synced(), ref: JOHN_3_16, colour: 'yellow', note: 'Loved', ...refs };
    case 'memoryItem':
      return {
        ...synced(),
        ref: JOHN_3_16,
        ease: 2.5,
        interval: 0,
        nextReviewAt: NOW,
        reviewCount: 0,
      };
    case 'inboxItem':
      return {
        ...synced(),
        origin: 'share',
        ref: JOHN_3_16,
        text: 'Loved',
        sourceUrl: 'https://www.bible.com/bible/3034/JHN.3.16.BSB',
        receivedAt: NOW,
        colour: null,
        importId: null,
        snoozedUntil: null,
        ...refs,
      };
    case 'takeaway':
      return { ...synced(), text: 'Hold fast', ...refs };
    case 'question':
      return { ...synced(), text: 'Why?', ...NOT_IN_GROUP.question, ...refs };
    case 'questionEntry':
      return { ...synced(), kind: 'answered', ...refs };
    case 'template':
      return { ...synced(), name: 'Sermon notes', structure: [{ title: 'Main point' }] };
    case 'passageVisit':
      return { ...synced(), book: 'JHN', startOrd: 43_003_016, endOrd: 43_003_016 };
    case 'resurfaceDismissal':
      return { ...synced(), rule: 'repeated_verse', targetKey: 'JHN.3.16', until: '2027-10-19' };
    case 'sectionTag':
    case 'lessonTag':
    case 'inboxItemTag':
      return { ...synced(), ...refs };
    case 'comment':
      // On their own section, in a group they're not in: kept, and seen by no one (§17.12).
      return commentRow(to.section!.id, newId());
    case 'groupVisit':
      return { ...synced(), groupId: newId(), seenRev: 3 };
  }
}

const settings = (colorMode: string) => ({
  changeId: newId(),
  baseRev: 0,
  clientTime: NOW,
  entity: 'userSettings' satisfies EntityName,
  op: 'upsert',
  row: {
    colorMode,
    defaultTranslation: 'BSB',
    reviewWindowDays: 14,
    autoPreviewVerses: false,
    pasteChips: true,
    openInTargets: ['blueletterbible', 'youversion', 'biblehub', 'logos'],
    defaultTemplates: { sermon: null, personal: null, group: null },
    resurfacing: { yearAgo: true, repeatedVerse: true, staleQuestion: true },
    lastDigestQuarter: null,
    updatedAt: NOW,
  },
});

/** One row of every entity, each referencing the ones before it, pushed by the account. */
async function fill(account: Account) {
  const rows: Rows = {};
  for (const entity of ROW_ENTITIES) rows[entity] = rowOf(entity, rows);
  const changes = [
    ...ROW_ENTITIES.map((entity) => upsert(entity, rows[entity]!)),
    settings('light'),
  ];
  const results = await pushOk(client, account, changes);
  expect(results.map((r) => r.status)).toEqual(changes.map(() => 'applied'));
  // A share link, which isn't synced: made through its own endpoint (M13-01).
  await client
    .post(
      '/api/share-links',
      { targetType: 'lesson', targetId: rows.lesson!.id, expiresAt: null },
      account.token,
    )
    .expect(201);
  // A group around the series, which isn't synced either (M13-07): the group, its member, its
  // series and its feed.
  const created = await client
    .post(
      '/api/groups',
      { name: 'Thursday group', seriesId: rows.series!.id, displayName: 'Ann' },
      account.token,
    )
    .expect(201);
  const groupId = groupIdResponseSchema.parse(created.body).groupId;
  // What the account adds to the group's thread: a section, a question and a comment on it.
  const shared = { visibility: 'group', groupId, sharedAt: NOW };
  const section = sectionRow(rows.lesson!.id, { ...shared, orderKey: 'a1' });
  const group = {
    id: groupId,
    section,
    question: questionRow(rows.lesson!.id, { visibility: 'group', groupId }),
    comment: commentRow(section.id, groupId),
  };
  const threads = await pushOk(client, account, [
    upsert('section', group.section),
    upsert('question', group.question),
    upsert('comment', group.comment),
  ]);
  expect(threads.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
  const revs = Object.fromEntries(
    ROW_ENTITIES.map((entity, i) => [entity, (results[i] as { rev: number }).rev]),
  ) as Record<RowEntity, number>;
  return { rows: rows as Record<RowEntity, Row>, revs, changes, group };
}

/** The tables with a `user_id` column; with `user`, every model (checked below). */
async function ownedTables(): Promise<string[]> {
  const rows = await t.prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

/**
 * The group tables with no `user_id` (§17.12), found from the schema as the `user_id` tables are:
 * `group` itself, and every table with a `group_id`. A group's rows are the account's when it's a
 * member of the group.
 */
async function groupTables(): Promise<Record<string, string>> {
  const rows = await t.prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns c
    WHERE table_schema = 'public' AND column_name = 'group_id'
      AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns u
        WHERE u.table_schema = 'public' AND u.table_name = c.table_name AND u.column_name = 'user_id'
      )
    ORDER BY table_name`;
  return Object.fromEntries([
    ['group', 'id'],
    ...rows.map((r) => [r.table_name, 'group_id'] as const),
  ]);
}

/** Every row the account has in every table, its `user` row and its groups' included, as stored. */
async function everything(userId: string): Promise<Record<string, unknown[]>> {
  const all: Record<string, unknown[]> = {};
  const read = async (table: string, where: string) =>
    (
      await t.prisma.$queryRawUnsafe<{ row: unknown }[]>(
        `SELECT to_jsonb(r) AS row FROM "public"."${table}" r WHERE ${where}
         ORDER BY to_jsonb(r)::text`,
        userId,
      )
    ).map((r) => r.row);
  for (const [table, column] of [
    ['user', 'id'],
    ...(await ownedTables()).map((name) => [name, 'user_id']),
  ] as const) {
    all[table] = await read(table, `r."${column}" = $1::uuid`);
  }
  for (const [table, column] of Object.entries(await groupTables())) {
    all[table] = await read(
      table,
      `r."${column}" IN (SELECT group_id FROM group_member WHERE user_id = $1::uuid)`,
    );
  }
  return all;
}

/** Their account, with a row in every table, and what it holds. */
async function theirAccount() {
  const theirs = await signUp();
  const filled = await fill(theirs);
  return { theirs, ...filled, before: await everything(theirs.id) };
}

type Theirs = Awaited<ReturnType<typeof theirAccount>>;

/** Nothing of theirs changed, and they are still signed in. */
async function expectUntouched({ theirs, before }: Theirs) {
  expect(await everything(theirs.id)).toEqual(before);
  const me = await client.get('/api/auth/me', theirs.token).expect(200);
  expect(meResponseSchema.parse(me.body).id).toBe(theirs.id);
}

/** Me, a member of their group, joined through its invite; what they hold is read again after. */
async function memberOf(their: Theirs): Promise<{ mine: Signed; their: Theirs }> {
  const mine = await signUp();
  const { url } = inviteResponseSchema.parse(
    (await client.get(`/api/groups/${their.group.id}/invite`, their.theirs.token).expect(200)).body,
  );
  await client
    .post(
      '/api/invites/join',
      { token: new URL(url).searchParams.get('token'), displayName: 'Ben' },
      mine.token,
    )
    .expect(200);
  return { mine, their: await readAgain(their) };
}

/** What they hold now, as the state that mustn't change from here on. */
const readAgain = async (their: Theirs): Promise<Theirs> => ({
  ...their,
  before: await everything(their.theirs.id),
});

const groupPull = (account: Account, groupId: string) =>
  client.get(`/api/groups/${groupId}/pull?cursor=0&clientVersion=${CLIENT_VERSION}`, account.token);

/** My own lesson for their group lesson (decision 99), pushed. */
async function ownLessonFor(mine: Account, their: Theirs): Promise<Row> {
  const own = lessonRow({
    id: await ownLessonId(mine.id, their.rows.lesson.id),
    title: 'The Good Shepherd',
    groupLessonId: their.rows.lesson.id,
  });
  const [result] = await pushOk(client, mine, [upsert('lesson', own)]);
  expect(result).toMatchObject({ status: 'applied' });
  return own;
}

const snake = (model: string) =>
  model.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase());

describe('the fixture', () => {
  it('reaches every model', async () => {
    const tables = Object.values(Prisma.ModelName).map(snake).toSorted();
    const groups = Object.keys(await groupTables());
    expect(['user', ...(await ownedTables()), ...groups].toSorted()).toEqual(tables);
    const { before } = await theirAccount();
    expect(Object.entries(before).filter(([, rows]) => rows.length === 0)).toEqual([]);
  });
});

describe('groups', () => {
  it("their group is closed to me: its feed, its invite's address and every change", async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const groupId = their.group.id;
    const member = await t.prisma.groupMember.findFirstOrThrow({ where: { groupId } });
    const mySeries = { ...synced(), title: 'Mine', description: '', kind: 'custom' };
    await pushOk(client, mine, [upsert('series', mySeries)]);

    const pulled = await client
      .get(`/api/sync/pull?cursor=0&clientVersion=${CLIENT_VERSION}&${PULL_DEVICE}`, mine.token)
      .expect(200);
    expect(pullResponseSchema.parse(pulled.body).groups).toEqual([]);
    const at = `/api/groups/${groupId}`;
    const calls = [
      client.get(`${at}/pull?cursor=0&clientVersion=${CLIENT_VERSION}`, mine.token),
      client.get(`${at}/invite`, mine.token),
      client.post(`${at}/invite`, {}, mine.token),
      client.patch(at, { name: 'Mine now' }, mine.token),
      client.post(`${at}/leave`, {}, mine.token),
      client.delete(`${at}/members/${their.theirs.id}`, {}, mine.token),
      client.post(`${at}/owner`, { userId: mine.id }, mine.token),
      client.post(`${at}/series`, { seriesId: mySeries.id }, mine.token),
      client.delete(`${at}/series/${their.rows.series.id}`, {}, mine.token),
    ];
    for (const call of calls) expect(errorCode(await call.expect(404))).toBe('NOT_FOUND');
    // Nor make a group of their series.
    await client
      .post(
        '/api/groups',
        { name: 'Theirs', seriesId: their.rows.series.id, displayName: 'Me' },
        mine.token,
      )
      .expect(404);
    expect(member.userId).toBe(their.theirs.id);
    await expectUntouched(their);
  });

  it('as a member, I read their group rows, and none of their private ones', async () => {
    const { mine, their } = await memberOf(await theirAccount());
    const groupId = their.group.id;
    const page = groupPullResponseSchema.parse((await groupPull(mine, groupId).expect(200)).body);
    const members = await t.prisma.groupMember.findMany({ where: { groupId } });
    expect(page.rows.map((r) => ('row' in r ? r.row.id : r.id)).toSorted()).toEqual(
      [
        groupId,
        ...members.map((m) => m.id),
        their.rows.series.id,
        their.rows.lesson.id,
        their.group.section.id,
        their.group.question.id,
        their.group.comment.id,
      ].toSorted(),
    );
    // My own pull is mine: the group, and none of their rows.
    const pulled = pullResponseSchema.parse(
      (
        await client
          .get(`/api/sync/pull?cursor=0&clientVersion=${CLIENT_VERSION}&${PULL_DEVICE}`, mine.token)
          .expect(200)
      ).body,
    );
    expect(pulled.rows).toEqual([]);
    expect(pulled.groups.map((g) => g.id)).toEqual([groupId]);
    await expectUntouched(their);
  });

  it("as a member, I can't reach their private rows, nor change their group rows", async () => {
    const joined = await memberOf(await theirAccount());
    const { mine } = joined;
    const own = await ownLessonFor(mine, joined.their);
    const their = await readAgain(joined.their);
    const groupId = their.group.id;
    const shared = { visibility: 'group', groupId, sharedAt: NOW };
    // Their private section and question, named from my group rows.
    const reaching = [
      upsert('section', sectionRow(own.id, { ...shared, replyToId: their.rows.section.id })),
      upsert(
        'section',
        sectionRow(own.id, {
          ...shared,
          answersQuestionId: their.rows.question.id,
          answerKind: 'full',
        }),
      ),
      upsert('comment', commentRow(their.rows.section.id, groupId)),
    ];
    const reached = await pushOk(client, mine, reaching);
    expect(reached).toEqual(
      reaching.map(() => expect.objectContaining({ errorCode: 'REFERENCE_NOT_FOUND' })),
    );
    // Their group rows are theirs: an edit or a delete of each is refused.
    const rows = {
      section: their.group.section,
      question: their.group.question,
      comment: their.group.comment,
    };
    for (const [entity, row] of Object.entries(rows) as [RowEntity, Row][]) {
      const [edit] = await pushOk(client, mine, [upsert(entity, { ...row, updatedAt: LATER }, 1)]);
      const [gone] = await pushOk(client, mine, [remove(entity, row.id, 1)]);
      expect([edit, gone]).toEqual([
        expect.objectContaining({ errorCode: 'ID_TAKEN' }),
        expect.objectContaining({ errorCode: 'ID_TAKEN' }),
      ]);
    }
    await expectUntouched(their);
  });

  it('a former member writes nothing into the feed, and their group is closed to them', async () => {
    const joined = await memberOf(await theirAccount());
    const { mine } = joined;
    const own = await ownLessonFor(mine, joined.their);
    const groupId = joined.their.group.id;
    const shared = { visibility: 'group', groupId, sharedAt: NOW };
    await pushOk(client, mine, [upsert('section', sectionRow(own.id, shared))]);
    await client.post(`/api/groups/${groupId}/leave`, {}, mine.token).expect(204);
    const their = await readAgain(joined.their);

    // What I typed offline before hearing I'd left: kept, as my own notes, and seen by no one.
    const section = sectionRow(own.id, { ...shared, orderKey: 'a1' });
    const question = questionRow(own.id, { visibility: 'group', groupId });
    const comment = commentRow(their.group.section.id, groupId);
    const results = await pushOk(client, mine, [
      upsert('section', section),
      upsert('question', question),
      upsert('comment', comment),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    await expect(
      t.prisma.section.findUniqueOrThrow({ where: { id: section.id } }),
    ).resolves.toMatchObject({ visibility: 'private', groupId: null });
    await expect(
      t.prisma.question.findUniqueOrThrow({ where: { id: question.id } }),
    ).resolves.toMatchObject({ visibility: 'private', groupId: null });

    expect(errorCode(await groupPull(mine, groupId).expect(404))).toBe('NOT_FOUND');
    const at = `/api/groups/${groupId}`;
    for (const call of [
      client.get(`${at}/invite`, mine.token),
      client.post(`${at}/leave`, {}, mine.token),
      client.patch(at, { name: 'Mine now' }, mine.token),
    ]) {
      expect(errorCode(await call.expect(404))).toBe('NOT_FOUND');
    }
    // Their group, its feed and its rev as they were.
    await expectUntouched(their);
  });

  it('no endpoint of my group reaches into theirs', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const mySeries = { ...synced(), title: 'Mine', description: '', kind: 'custom' };
    await pushOk(client, mine, [upsert('series', mySeries)]);
    const created = await client
      .post('/api/groups', { name: 'Mine', seriesId: mySeries.id, displayName: 'Me' }, mine.token)
      .expect(201);
    const at = `/api/groups/${groupIdResponseSchema.parse(created.body).groupId}`;
    const theirMember = await t.prisma.groupMember.findFirstOrThrow({
      where: { groupId: their.group.id },
    });
    for (const call of [
      client.post(`${at}/series`, { seriesId: their.rows.series.id }, mine.token),
      client.delete(`${at}/series/${their.rows.series.id}`, {}, mine.token),
      client.delete(`${at}/members/${their.theirs.id}`, {}, mine.token),
      client.delete(`${at}/members/${theirMember.id}`, {}, mine.token),
      client.post(`${at}/owner`, { userId: their.theirs.id }, mine.token),
    ]) {
      expect(errorCode(await call.expect(404))).toBe('NOT_FOUND');
    }
    await expectUntouched(their);
  });
});

describe('reading', () => {
  it('my share links list none of theirs, nor revoke them', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const res = await client.get('/api/share-links', mine.token).expect(200);
    expect(shareLinksResponseSchema.parse(res.body).links).toEqual([]);
    const link = await t.prisma.shareLink.findFirstOrThrow({ where: { userId: their.theirs.id } });
    await client.delete(`/api/share-links/${link.id}`, undefined, mine.token).expect(404);
    // Nor share their lesson themselves.
    await client
      .post(
        '/api/share-links',
        { targetType: 'lesson', targetId: their.rows.lesson.id, expiresAt: null },
        mine.token,
      )
      .expect(404);
    await expectUntouched(their);
  });

  it('a pull, my account and my devices show none of theirs', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    for (const cursor of [0, 3]) {
      const res = await client
        .get(
          `/api/sync/pull?cursor=${cursor}&clientVersion=${CLIENT_VERSION}&${PULL_DEVICE}`,
          mine.token,
        )
        .expect(200);
      expect(pullResponseSchema.parse(res.body)).toMatchObject({ rows: [], remaining: 0 });
    }
    const me = await client.get('/api/auth/me', mine.token).expect(200);
    expect(meResponseSchema.parse(me.body)).toMatchObject({ id: mine.id, email: mine.email });
    // Both accounts synced from the same device id; the list shows my record of it only.
    const devices = await client.get('/api/account/devices', mine.token).expect(200);
    expect(devicesResponseSchema.parse(devices.body).devices.map((d) => d.id)).toEqual([DEVICE_ID]);
    await expectUntouched(their);
  });
});

describe('overwriting', () => {
  it.each(ROW_ENTITIES)('an upsert of their %s is rejected', async (entity) => {
    const their = await theirAccount();
    const mine = await signUp();
    // Their row, valid and newer, so it would win were it mine.
    const row = { ...their.rows[entity], updatedAt: LATER };
    const [result] = await pushOk(client, mine, [upsert(entity, row, their.revs[entity])]);
    expect(result).toMatchObject({ status: 'rejected', errorCode: 'ID_TAKEN' });
    await expectUntouched(their);
  });

  it('my settings are mine: pushing them leaves theirs', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const [result] = await pushOk(client, mine, [settings('dark')]);
    expect(result).toMatchObject({ status: 'applied' });
    await expect(
      t.prisma.userSettings.findUniqueOrThrow({ where: { userId: mine.id } }),
    ).resolves.toMatchObject({ colorMode: 'dark' });
    await expectUntouched(their);
  });

  it('a change id of theirs is refused, and their result kept', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const [result] = await pushOk(client, mine, [their.changes[0]!]);
    expect(result).toMatchObject({ status: 'rejected', errorCode: 'CHANGE_ID_TAKEN' });
    await expectUntouched(their);
  });
});

describe('deleting', () => {
  it.each(ROW_ENTITIES)('a delete of their %s is rejected', async (entity) => {
    const their = await theirAccount();
    const mine = await signUp();
    const [result] = await pushOk(client, mine, [
      remove(entity, their.rows[entity].id, their.revs[entity]),
    ]);
    expect(result).toMatchObject({ status: 'rejected', errorCode: 'ID_TAKEN' });
    await expectUntouched(their);
  });

  it('signing out a device id we share ends my sessions only', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    await fill(mine);
    await client.delete(`/api/account/devices/${DEVICE_ID}`, undefined, mine.token).expect(204);
    await client.get('/api/auth/me', mine.token).expect(401);
    await expect(t.prisma.session.count({ where: { userId: mine.id } })).resolves.toBe(0);
    await expectUntouched(their);
  });

  it('a device only they have is not found', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    const res = await client
      .delete(`/api/account/devices/${DEVICE_ID}`, undefined, mine.token)
      .expect(404);
    expect(errorCode(res)).toBe('NOT_FOUND');
    await expectUntouched(their);
  });
});

/** Every column that holds another row's id, with the entity it points at. */
const REFERENCES = ROW_ENTITIES.flatMap((entity) =>
  Object.entries(ENTITY_TABLES[entity].refs).map(([column, target]) => ({
    entity,
    column,
    target,
  })),
);

describe('referencing', () => {
  it.each(REFERENCES)(
    'a $entity whose $column is their $target is rejected',
    async ({ entity, column, target }) => {
      const their = await theirAccount();
      const mine = await signUp();
      const { rows } = await fill(mine);
      // A section of mine has no parent here, so the parent's lesson can't be what refuses it;
      // a parent of theirs comes with their lesson, as a parent shares its section's lesson.
      const row = {
        ...rowOf(entity, entity === 'section' ? { ...rows, section: undefined } : rows),
        ...(column === 'parentId' ? { lessonId: their.rows.lesson.id } : {}),
        [column]: their.rows[target].id,
      };
      const [result] = await pushOk(client, mine, [upsert(entity, row)]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });
      await expectUntouched(their);
    },
  );
});

describe('my account', () => {
  it('signing out, changing the password and deleting it leave theirs alone', async () => {
    const their = await theirAccount();
    const mine = await signUp();
    await fill(mine);
    await client.post('/api/auth/logout', {}, mine.token).expect(204);
    await expectUntouched(their);

    const again = await client
      .post('/api/auth/login', { email: mine.email, password: PASSWORD })
      .expect(200);
    const token = sessionCookie(again)?.token ?? '';
    await client
      .post(
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'a light to my path' },
        token,
      )
      .expect(204);
    await client.post('/api/auth/forgot-password', { email: mine.email }).expect(204);
    await expectUntouched(their);

    await client.delete('/api/account', { password: 'a light to my path' }, token).expect(204);
    await expect(t.prisma.user.count({ where: { id: mine.id } })).resolves.toBe(0);
    await expectUntouched(their);
  });
});
