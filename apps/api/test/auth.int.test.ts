import { apiErrorSchema, meResponseSchema } from '@lamp/domain';
import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCKOUT_MS, MAX_FAILED_LOGINS } from '../src/auth/login-lockout.js';
import { SESSION_TTL_MS, hashToken } from '../src/auth/sessions.service.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient, sessionCookie } from './int/http.js';

let t: TestApp;
let client: Client;

const PASSWORD = 'a lamp to my feet';
const DAY = 24 * 60 * 60 * 1000;

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

afterEach(() => {
  vi.useRealTimers();
});

let nextEmail = 1;
const newEmail = (): string => `reader${nextEmail++}@example.com`;

/** Signs up a new account; returns its email and session token. */
async function signUp(email = newEmail()): Promise<{ email: string; token: string }> {
  const res = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  const cookie = sessionCookie(res);
  if (!cookie) throw new Error('sign-up set no session cookie');
  return { email, token: cookie.token };
}

const login = (email: string, password = PASSWORD) =>
  client.post('/api/auth/login', { email, password });

function errorCode(res: request.Response): string {
  return apiErrorSchema.parse(res.body).errorCode;
}

describe('POST /api/auth/signup', () => {
  it('creates the account, signs it in and returns me', async () => {
    const res = await client
      .post('/api/auth/signup', { email: ' Reader@Example.com ', password: PASSWORD })
      .expect(201);
    const me = meResponseSchema.parse(res.body);
    expect(me).toMatchObject({ email: 'Reader@Example.com', emailVerifiedAt: null, role: 'user' });

    const user = await t.prisma.user.findUniqueOrThrow({ where: { id: me.id } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.passwordHash).not.toContain(PASSWORD);

    const cookie = sessionCookie(res);
    expect(cookie?.token).toMatch(/^[\w-]{43}$/);
    expect(cookie?.attributes).toEqual(
      expect.arrayContaining(['httponly', 'secure', 'samesite=lax', 'path=/api']),
    );
    const sessions = await t.prisma.session.findMany();
    expect(sessions).toHaveLength(1);
    // Only the token's hash is stored.
    expect(sessions[0]?.tokenHash).toBe(hashToken(cookie?.token ?? ''));
    expect(sessions[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);

    const meRes = await client.get('/api/auth/me', cookie?.token).expect(200);
    expect(meRes.body).toEqual(me);
  });

  it('refuses an email that is taken, in any case', async () => {
    await signUp('reader@example.com');
    const res = await client
      .post('/api/auth/signup', { email: 'READER@example.com', password: PASSWORD })
      .expect(409);
    expect(errorCode(res)).toBe('EMAIL_TAKEN');
    await expect(t.prisma.user.count()).resolves.toBe(1);
  });

  it('refuses a common password', async () => {
    const res = await client
      .post('/api/auth/signup', { email: newEmail(), password: 'qwertyuiop' })
      .expect(400);
    expect(errorCode(res)).toBe('PASSWORD_TOO_COMMON');
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });

  it('validates the body with the shared schema, without echoing the password', async () => {
    const res = await client
      .post('/api/auth/signup', { email: 'not-an-email', password: 'short-pw' })
      .expect(400);
    expect(errorCode(res)).toBe('VALIDATION_FAILED');
    expect(res.body.details.issues.map((i: { path: string[] }) => i.path)).toEqual([
      ['email'],
      ['password'],
    ]);
    expect(JSON.stringify(res.body)).not.toContain('short-pw');
  });
});

describe('POST /api/auth/login', () => {
  it('signs in with the right password, in a new session', async () => {
    const { email, token } = await signUp();
    const res = await login(email.toUpperCase()).expect(200);
    expect(meResponseSchema.parse(res.body).email).toBe(email);
    const cookie = sessionCookie(res);
    expect(cookie?.token).toBeDefined();
    expect(cookie?.token).not.toBe(token);
    await expect(t.prisma.session.count()).resolves.toBe(2);
    await client.get('/api/auth/me', cookie?.token).expect(200);
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    const { email } = await signUp();
    const wrong = await login(email, 'not the password').expect(401);
    const unknown = await login(newEmail()).expect(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(errorCode(wrong)).toBe('INVALID_CREDENTIALS');
    expect(sessionCookie(wrong)).toBeUndefined();
  });

  it('refuses a disabled account, and its sessions stop working', async () => {
    const { email, token } = await signUp();
    await t.prisma.user.update({ where: { email }, data: { disabledAt: new Date() } });
    expect(errorCode(await login(email).expect(403))).toBe('ACCOUNT_DISABLED');
    await client.get('/api/auth/me', token).expect(401);
  });
});

describe('lockout', () => {
  it('locks an email for 15 minutes after five failed sign-ins', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { email } = await signUp();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(email, 'not the password').expect(401);

    // Locked even with the right password, and in any case.
    const locked = await login(email.toUpperCase()).expect(429);
    expect(errorCode(locked)).toBe('ACCOUNT_LOCKED');
    expect(locked.body.details.retryAfterSeconds).toBe(LOCKOUT_MS / 1000);

    // Other accounts are not affected.
    const other = await signUp();
    await login(other.email).expect(200);

    vi.setSystemTime(Date.now() + LOCKOUT_MS - 1000);
    await login(email).expect(429);
    vi.setSystemTime(Date.now() + 1000);
    await login(email).expect(200);
  });

  it('locks an email that has no account the same way', async () => {
    const email = newEmail();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await login(email).expect(401);
    expect(errorCode(await login(email).expect(429))).toBe('ACCOUNT_LOCKED');
  });
});

describe('rate limits', () => {
  it('limits sign-up and login attempts per IP', async () => {
    let last: request.Response | undefined;
    for (let i = 0; i < 31; i++) last = await login(newEmail());
    expect(last?.status).toBe(429);
    expect(errorCode(last!)).toBe('TOO_MANY_REQUESTS');
    // Another address is still let through.
    const other = await createClient(t);
    await other.post('/api/auth/login', { email: newEmail(), password: PASSWORD }).expect(401);
  });

  it('limits attempts per email, from any IP', async () => {
    const email = newEmail();
    let last: request.Response | undefined;
    for (let i = 0; i < 11; i++) {
      const from = await createClient(t);
      last = await from.post('/api/auth/signup', { email, password: PASSWORD });
    }
    expect(last?.status).toBe(429);
    expect(errorCode(last!)).toBe('TOO_MANY_REQUESTS');
  });
});

describe('sessions', () => {
  it('GET /api/auth/me needs a session', async () => {
    expect(errorCode(await client.get('/api/auth/me').expect(401))).toBe('UNAUTHORIZED');
    const res = await client.get('/api/auth/me', 'A'.repeat(43)).expect(401);
    // An unknown token is cleared from the browser.
    expect(sessionCookie(res)?.token).toBe('');
  });

  it('logout ends this session only and clears the cookie', async () => {
    const { email, token } = await signUp();
    const second = sessionCookie(await login(email).expect(200))?.token;
    const res = await client.post('/api/auth/logout', {}, token).expect(204);
    expect(sessionCookie(res)?.token).toBe('');
    await client.get('/api/auth/me', token).expect(401);
    await client.get('/api/auth/me', second).expect(200);
    await expect(t.prisma.session.count()).resolves.toBe(1);
  });

  it('logout without a session still answers 204', async () => {
    const res = await client.post('/api/auth/logout');
    expect(res.status).toBe(204);
  });

  it('an expired session is refused and deleted', async () => {
    const { token } = await signUp();
    await t.prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    await client.get('/api/auth/me', token).expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });

  it('a session in use is renewed for another 90 days', async () => {
    const { token } = await signUp();
    // A fresh session is not rewritten on every request.
    expect(sessionCookie(await client.get('/api/auth/me', token).expect(200))).toBeUndefined();

    // Last seen two hours ago, ten days left.
    await t.prisma.session.updateMany({
      data: {
        lastSeenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        expiresAt: new Date(Date.now() + 10 * DAY),
      },
    });
    const res = await client.get('/api/auth/me', token).expect(200);
    const cookie = sessionCookie(res);
    expect(cookie?.token).toBe(token);
    const expires = cookie?.attributes.find((a) => a.startsWith('expires='));
    expect(new Date(expires?.slice('expires='.length) ?? 0).getTime()).toBeGreaterThan(
      Date.now() + 89 * DAY,
    );
    const session = await t.prisma.session.findFirstOrThrow();
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
    expect(session.lastSeenAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('a session that ran out of time is not renewed by its last use', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { token } = await signUp();
    vi.setSystemTime(Date.now() + SESSION_TTL_MS + 1000);
    await client.get('/api/auth/me', token).expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);
  });
});

const signupBody = () => ({ email: newEmail(), password: PASSWORD });

describe('Origin check', () => {
  it('rejects a non-GET request without an Origin', async () => {
    const res = await request(client.origin)
      .post('/api/auth/signup')
      .send(signupBody())
      .expect(403);
    expect(errorCode(res)).toBe('BAD_ORIGIN');
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });

  it('rejects another site, and the "null" origin', async () => {
    for (const origin of ['https://evil.example', 'null', `${client.origin}.evil.example`]) {
      const res = await request(client.origin)
        .post('/api/auth/signup')
        .set('Origin', origin)
        .send(signupBody())
        .expect(403);
      expect(errorCode(res)).toBe('BAD_ORIGIN');
    }
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });

  it('rejects before the session is used, so logout from another site does nothing', async () => {
    const { token } = await signUp();
    const res = await request(client.origin)
      .post('/api/auth/logout')
      .set('Cookie', `lamp_session=${token}`)
      .expect(403);
    expect(errorCode(res)).toBe('BAD_ORIGIN');
    await client.get('/api/auth/me', token).expect(200);
    await expect(t.prisma.session.count()).resolves.toBe(1);
  });

  it('lets GET through without one', async () => {
    const { token } = await signUp();
    const me = await request(client.origin)
      .get('/api/auth/me')
      .set('Cookie', `lamp_session=${token}`)
      .expect(200);
    expect(meResponseSchema.safeParse(me.body).success).toBe(true);
    const health = await request(client.origin).get('/api/health');
    expect(health.status).toBe(200);
  });
});
