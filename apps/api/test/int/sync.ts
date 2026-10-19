import {
  type EntityName,
  MIN_CLIENT_VERSION,
  newId,
  NOT_IN_GROUP,
  type PushResult,
  pushResponseSchema,
} from '@lamp/domain';
import type { TestApp } from './app.js';
import { type Client, sessionCookie } from './http.js';
import { runEmail } from './mail.js';

/** Rows and changes as a device sends them (`changeSchema`), and the calls to push them. */

export const DEVICE_ID = '0199e0a0-0000-7000-8000-000000000001';
/** The version the test device reports: the oldest the API serves. */
export const CLIENT_VERSION = MIN_CLIENT_VERSION;
/** The device a pull names, as query parameters. */
export const PULL_DEVICE = `deviceId=${DEVICE_ID}&deviceName=Chrome%20on%20Android`;
export const EARLIER = '2026-10-13T09:00:00.000Z';
export const NOW = '2026-10-13T10:00:00.000Z';
export const LATER = '2026-10-13T11:00:00.000Z';

export const ROMANS_8 = { book: 'ROM', chapter: 8, display: 'Romans 8' };
export const ROMANS_8_28 = { ...ROMANS_8, verseStart: 28, display: 'Romans 8:28' };
export const JOHN_3_16 = {
  book: 'JHN',
  chapter: 3,
  verseStart: 16,
  display: 'John 3:16',
};

export type Row = { id: string } & Record<string, unknown>;

export const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, deletedAt: null });

export const lessonRow = (fields: object = {}): Row => ({
  ...synced(),
  seriesId: null,
  title: 'More than conquerors',
  date: '2026-10-04',
  kind: 'sermon',
  speaker: null,
  church: null,
  sourceType: null,
  sourceTitle: null,
  sourceAuthor: null,
  sourceUrl: null,
  sourceStartedAt: null,
  mainPassages: [ROMANS_8],
  groupLessonId: null,
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

/** A body with a link chip to a lesson or section (F23). */
export const bodyLinking = (
  targetType: 'lesson' | 'section',
  targetId: string,
  label = 'Shepherd',
) => ({
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Same idea as ' },
        { type: 'noteLink', attrs: { targetType, targetId, label } },
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
  sourceAt: null,
  sourcePage: null,
  ...NOT_IN_GROUP.section,
  ...fields,
});

/** A question, private unless `fields` say otherwise. */
export const questionRow = (lessonId: string, fields: object = {}): Row => ({
  ...synced(),
  lessonId,
  text: 'Who are the other sheep?',
  splitFromId: null,
  ...NOT_IN_GROUP.question,
  ...fields,
});

/** A comment on a group section. */
export const commentRow = (
  sectionId: string,
  groupId: string,
  text = 'Like the sheepfold',
): Row => ({
  ...synced(),
  sectionId,
  groupId,
  body: bodyOf(text),
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
    { deviceId: DEVICE_ID, deviceName, clientVersion: CLIENT_VERSION, changes },
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
