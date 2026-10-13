import { type EntityName, newId, type PushResult, pushResponseSchema } from '@lamp/domain';
import type { TestApp } from './app.js';
import { type Client, sessionCookie } from './http.js';
import { runEmail } from './mail.js';

/** Rows and changes as a device sends them (`changeSchema`), and the calls to push them. */

export const DEVICE_ID = '0199e0a0-0000-7000-8000-000000000001';
export const EARLIER = '2026-10-13T09:00:00.000Z';
export const NOW = '2026-10-13T10:00:00.000Z';
export const LATER = '2026-10-13T11:00:00.000Z';

export const ROMANS_8 = { book: 'ROM', chapter: 8, display: 'Romans 8', translation: 'WEB' };
export const ROMANS_8_28 = { ...ROMANS_8, verseStart: 28, display: 'Romans 8:28' };
export const JOHN_3_16 = {
  book: 'JHN',
  chapter: 3,
  verseStart: 16,
  display: 'John 3:16',
  translation: 'WEB',
};

export type Row = { id: string } & Record<string, unknown>;

export const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, deletedAt: null });

export const lessonRow = (fields: object = {}): Row => ({
  ...synced(),
  seriesId: null,
  title: 'More than conquerors',
  date: '2026-10-04',
  source: 'sermon',
  speaker: null,
  church: null,
  mainPassages: [ROMANS_8],
  ...fields,
});

export const bodyCiting = (...refs: object[]) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Nothing separates us ' },
        ...refs.map((attrs) => ({ type: 'verse', attrs })),
      ],
    },
  ],
});

export const bodyOf = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

export const sectionRow = (lessonId: string, fields: object = {}): Row => ({
  ...synced(),
  lessonId,
  parentId: null,
  orderKey: 'a0',
  body: bodyCiting(ROMANS_8_28),
  conflictOf: null,
  conflictDevice: null,
  ...fields,
});

export const tagRow = (name: string): Row => ({ ...synced(), name, isSeeded: false });

export const upsert = (entity: EntityName, row: Row, baseRev = 0, changed?: string[]) => ({
  changeId: newId(),
  baseRev,
  clientTime: row.updatedAt as string,
  entity,
  entityId: row.id,
  op: 'upsert',
  row,
  ...(changed ? { changed } : {}),
});

export const remove = (entity: EntityName, id: string, baseRev: number, clientTime = LATER) => ({
  changeId: newId(),
  baseRev,
  clientTime,
  entity,
  entityId: id,
  op: 'delete',
});

export interface Account {
  id: string;
  token: string;
}

/** Signs up a new account, with its email verified unless asked not to. */
export async function signUp(
  t: TestApp,
  client: Client,
  { verified = true } = {},
): Promise<Account> {
  const res = await client
    .post('/api/auth/signup', { email: runEmail('sync'), password: 'a lamp to my feet' })
    .expect(201);
  const id = (res.body as { id: string }).id;
  if (verified) {
    await t.prisma.user.update({ where: { id }, data: { emailVerifiedAt: new Date() } });
  }
  return { id, token: sessionCookie(res)?.token ?? '' };
}

export const push = (
  client: Client,
  account: Account | undefined,
  changes: object[],
  deviceName = 'Chrome on Android',
) =>
  client.post(
    '/api/sync/push',
    { deviceId: DEVICE_ID, deviceName, clientVersion: '0.0.0', changes },
    account?.token,
  );

export async function pushOk(
  client: Client,
  account: Account,
  changes: object[],
  deviceName?: string,
): Promise<PushResult[]> {
  const res = await push(client, account, changes, deviceName).expect(200);
  return pushResponseSchema.parse(res.body).results;
}
