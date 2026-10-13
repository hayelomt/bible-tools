import { apiErrorSchema } from '@lamp/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MAX_FAILED_LOGINS } from '../src/auth/login-lockout.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient, sessionCookie } from './int/http.js';
import { runEmail } from './int/mail.js';

let t: TestApp;
let client: Client;

const PASSWORD = 'a lamp to my feet';
const NEW_PASSWORD = 'a light to my path';

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

/** Signs up, then signs in once more: the account's email, id and two session tokens. */
async function signUpTwice(email = runEmail('account')) {
  const signup = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  const login = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  return {
    email,
    userId: (signup.body as { id: string }).id,
    token: sessionCookie(signup)?.token ?? '',
    other: sessionCookie(login)?.token ?? '',
  };
}

const changePassword = (token: string, currentPassword = PASSWORD, newPassword = NEW_PASSWORD) =>
  client.post('/api/auth/change-password', { currentPassword, newPassword }, token);

const deleteAccount = (token: string, password = PASSWORD) =>
  client.delete('/api/account', { password }, token);

const login = (email: string, password: string) =>
  client.post('/api/auth/login', { email, password });

describe('POST /api/auth/change-password', () => {
  it('needs a session', async () => {
    const res = await client
      .post('/api/auth/change-password', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('sets the password and ends every other session, keeping this one', async () => {
    const { email, token, other } = await signUpTwice();
    const res = await changePassword(token).expect(204);
    expect(sessionCookie(res)).toBeUndefined();

    await client.get('/api/auth/me', token).expect(200);
    await client.get('/api/auth/me', other).expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(1);

    await login(email, PASSWORD).expect(401);
    await login(email, NEW_PASSWORD).expect(200);
  });

  it('leaves other accounts signed in', async () => {
    const { token } = await signUpTwice();
    const someoneElse = await signUpTwice();
    await changePassword(token).expect(204);
    await expect(t.prisma.session.count({ where: { userId: someoneElse.userId } })).resolves.toBe(
      2,
    );
    await client.get('/api/auth/me', someoneElse.other).expect(200);
  });

  it('refuses a wrong current password and changes nothing', async () => {
    const { email, token, other } = await signUpTwice();
    const res = await changePassword(token, 'not the password').expect(403);
    expect(errorCode(res)).toBe('WRONG_PASSWORD');
    await client.get('/api/auth/me', other).expect(200);
    await login(email, PASSWORD).expect(200);
  });

  it('refuses a common new password and changes nothing', async () => {
    const { email, token, other } = await signUpTwice();
    expect(errorCode(await changePassword(token, PASSWORD, 'qwertyuiop').expect(400))).toBe(
      'PASSWORD_TOO_COMMON',
    );
    await client.get('/api/auth/me', other).expect(200);
    await login(email, PASSWORD).expect(200);
  });

  it('counts wrong passwords towards the login lockout', async () => {
    const { email, token } = await signUpTwice();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await changePassword(token, 'not the password').expect(403);
    }
    // Locked even with the right password, here and at login.
    expect(errorCode(await changePassword(token).expect(429))).toBe('ACCOUNT_LOCKED');
    expect(errorCode(await login(email, PASSWORD).expect(429))).toBe('ACCOUNT_LOCKED');
    // The session itself still works.
    await client.get('/api/auth/me', token).expect(200);
  });
});

/** The tables with a `user_id` column, so a table added later is covered without editing this. */
async function ownedTables(): Promise<string[]> {
  const rows = await t.prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'user_id'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name);
}

/** Rows per table that belong to the user, the `user` row itself included. */
async function rowsOwnedBy(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [table, column] of [
    ['user', 'id'],
    ...(await ownedTables()).map((name) => [name, 'user_id']),
  ] as const) {
    const [row] = await t.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM "public"."${table}" WHERE "${column}" = $1::uuid`,
      userId,
    );
    counts[table] = row?.n ?? 0;
  }
  return counts;
}

/** At least one row in every table the user can own (sessions and the email token exist already). */
async function fillAccount(userId: string): Promise<void> {
  const p = t.prisma;
  const series = await p.series.create({ data: { userId, title: 'Romans' } });
  const lesson = await p.lesson.create({
    data: { userId, seriesId: series.id, title: 'Lesson', date: new Date('2026-10-04') },
  });
  const section = await p.section.create({
    data: { userId, lessonId: lesson.id, orderKey: 'a0', body: { type: 'doc', content: [] } },
  });
  const tag = await p.tag.create({ data: { userId, name: 'grace' } });
  await p.$transaction([
    p.userSettings.create({ data: { userId } }),
    p.sectionTag.create({ data: { userId, sectionId: section.id, tagId: tag.id } }),
    p.lessonTag.create({ data: { userId, lessonId: lesson.id, tagId: tag.id } }),
    p.takeaway.create({ data: { userId, lessonId: lesson.id, text: 't' } }),
    p.question.create({ data: { userId, lessonId: lesson.id, text: 'q' } }),
    p.highlight.create({ data: { userId, ref: {}, colour: 'yellow' } }),
    p.memoryItem.create({ data: { userId, ref: {} } }),
    p.citation.create({
      data: {
        userId,
        sourceType: 'section',
        sourceId: section.id,
        lessonId: lesson.id,
        book: 'ROM',
        startOrd: 45001001,
        endOrd: 45001002,
      },
    }),
    p.syncChange.create({
      data: { id: crypto.randomUUID(), userId, deviceId: crypto.randomUUID(), status: 'applied' },
    }),
    p.device.create({
      data: { id: crypto.randomUUID(), userId, name: 'Phone', clientVersion: '0.0.0' },
    }),
  ]);
}

describe('DELETE /api/account', () => {
  it('needs a session', async () => {
    expect(errorCode(await client.delete('/api/account', { password: PASSWORD }).expect(401))).toBe(
      'UNAUTHORIZED',
    );
  });

  it('needs the Origin of the site', async () => {
    const { userId, token } = await signUpTwice();
    const res = await request(client.origin)
      .delete('/api/account')
      .set('Cookie', `lamp_session=${token}`)
      .send({ password: PASSWORD })
      .expect(403);
    expect(errorCode(res)).toBe('BAD_ORIGIN');
    await expect(t.prisma.user.count({ where: { id: userId } })).resolves.toBe(1);
  });

  it('removes every row the user owns, and nothing of anyone else', async () => {
    const { userId, token } = await signUpTwice();
    const someoneElse = await signUpTwice();
    await fillAccount(userId);
    await fillAccount(someoneElse.userId);
    const before = await rowsOwnedBy(userId);
    // The fixture reaches every table, so "all zero" below means something.
    expect(Object.entries(before).filter(([, n]) => n === 0)).toEqual([]);
    const othersBefore = await rowsOwnedBy(someoneElse.userId);

    const res = await deleteAccount(token).expect(204);
    // The browser drops the cookie.
    expect(sessionCookie(res)?.token).toBe('');

    const after = await rowsOwnedBy(userId);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);
    await expect(rowsOwnedBy(someoneElse.userId)).resolves.toEqual(othersBefore);
  });

  it('signs out every device', async () => {
    const { email, token, other } = await signUpTwice();
    await deleteAccount(token).expect(204);
    for (const session of [token, other]) {
      expect(errorCode(await client.get('/api/auth/me', session).expect(401))).toBe('UNAUTHORIZED');
    }
    expect(errorCode(await login(email, PASSWORD).expect(401))).toBe('INVALID_CREDENTIALS');
  });

  it('frees the email for a new account', async () => {
    const { email, userId, token } = await signUpTwice();
    await deleteAccount(token).expect(204);
    const res = await client
      .post('/api/auth/signup', { email, password: NEW_PASSWORD })
      .expect(201);
    expect((res.body as { id: string }).id).not.toBe(userId);
  });

  it('a wrong password deletes nothing', async () => {
    const { userId, token, other } = await signUpTwice();
    await fillAccount(userId);
    const before = await rowsOwnedBy(userId);

    const res = await deleteAccount(token, 'not the password').expect(403);
    expect(errorCode(res)).toBe('WRONG_PASSWORD');
    expect(sessionCookie(res)).toBeUndefined();

    await expect(rowsOwnedBy(userId)).resolves.toEqual(before);
    await client.get('/api/auth/me', other).expect(200);
  });

  it('validates the body without echoing the password', async () => {
    const { token } = await signUpTwice();
    const res = await client
      .delete('/api/account', { password: PASSWORD, confirm: 'DELETE' }, token)
      .expect(400);
    expect(errorCode(res)).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
    await expect(t.prisma.user.count()).resolves.toBe(1);
  });
});
