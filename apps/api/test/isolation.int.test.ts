import {
  apiErrorSchema,
  devicesResponseSchema,
  type EntityName,
  meResponseSchema,
  newId,
  pullResponseSchema,
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
      return { ...synced(), text: 'Why?', ...refs };
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
  const revs = Object.fromEntries(
    ROW_ENTITIES.map((entity, i) => [entity, (results[i] as { rev: number }).rev]),
  ) as Record<RowEntity, number>;
  return { rows: rows as Record<RowEntity, Row>, revs, changes };
}

/** The tables with a `user_id` column; with `user`, every model (checked below). */
async function ownedTables(): Promise<string[]> {
  const rows = await t.prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

/** Every row the account has in every table, its `user` row included, as stored. */
async function everything(userId: string): Promise<Record<string, unknown[]>> {
  const all: Record<string, unknown[]> = {};
  for (const [table, column] of [
    ['user', 'id'],
    ...(await ownedTables()).map((name) => [name, 'user_id']),
  ] as const) {
    const rows = await t.prisma.$queryRawUnsafe<{ row: unknown }[]>(
      `SELECT to_jsonb(r) AS row FROM "public"."${table}" r WHERE r."${column}" = $1::uuid
       ORDER BY to_jsonb(r)::text`,
      userId,
    );
    all[table] = rows.map((r) => r.row);
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

const snake = (model: string) =>
  model.replace(/[A-Z]/g, (c, i) => (i ? '_' : '') + c.toLowerCase());

describe('the fixture', () => {
  it('reaches every model', async () => {
    const tables = Object.values(Prisma.ModelName).map(snake).toSorted();
    expect(['user', ...(await ownedTables())].toSorted()).toEqual(tables);
    const { before } = await theirAccount();
    expect(Object.entries(before).filter(([, rows]) => rows.length === 0)).toEqual([]);
  });
});

describe('reading', () => {
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
