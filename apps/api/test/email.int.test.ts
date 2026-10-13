import { apiErrorSchema, meResponseSchema } from '@lamp/domain';
import type request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RESEND_COOLDOWN_MS } from '../src/auth/auth.service.js';
import { EMAIL_TOKEN_TTL_MS } from '../src/auth/email-tokens.service.js';
import { MAX_FAILED_LOGINS } from '../src/auth/login-lockout.js';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient, sessionCookie } from './int/http.js';
import { emailsTo, lastEmailTo, runEmail, tokenIn } from './int/mail.js';

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

afterEach(() => {
  vi.useRealTimers();
});

const newEmail = (): string => runEmail();

async function signUp(email = newEmail()): Promise<{ email: string; token: string }> {
  const res = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  return { email, token: sessionCookie(res)?.token ?? '' };
}

const errorCode = (res: request.Response): string => apiErrorSchema.parse(res.body).errorCode;
const verify = (token: string) => client.post('/api/auth/verify-email', { token });
const forgot = (email: string) => client.post('/api/auth/forgot-password', { email });
const reset = (token: string, password = NEW_PASSWORD) =>
  client.post('/api/auth/reset-password', { token, password });

async function me(session: string) {
  return meResponseSchema.parse((await client.get('/api/auth/me', session).expect(200)).body);
}

describe('email verification', () => {
  it('sign-up sends a link that verifies the email, once', async () => {
    const { email, token: session } = await signUp();
    const mail = await lastEmailTo(email);
    expect(mail.subject).toBe('Confirm your email for Lamp');
    expect(mail.from?.value[0]?.address).toBe('noreply@localhost');
    expect(mail.text).toContain('http://localhost:5173/verify-email?token=');
    const token = tokenIn(mail, '/verify-email');
    // Only the hash is stored.
    const stored = await t.prisma.emailToken.findFirstOrThrow();
    expect(stored).toMatchObject({ kind: 'verify', usedAt: null });
    expect(stored.tokenHash).not.toContain(token);

    // The link works without a session: it may be opened on another device.
    const res = await verify(token).expect(204);
    expect(res.body).toEqual({});
    expect((await me(session)).emailVerifiedAt).toEqual(expect.any(String));

    expect(errorCode(await verify(token).expect(400))).toBe('TOKEN_INVALID');
  });

  it('refuses an expired link', async () => {
    const { email, token: session } = await signUp();
    const token = tokenIn(await lastEmailTo(email), '/verify-email');
    await t.prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(errorCode(await verify(token).expect(400))).toBe('TOKEN_INVALID');
    expect((await me(session)).emailVerifiedAt).toBeNull();
  });

  it('refuses an unknown token, and a reset token', async () => {
    const { email, token: session } = await signUp();
    expect(errorCode(await verify('A'.repeat(43)).expect(400))).toBe('TOKEN_INVALID');
    await forgot(email).expect(204);
    const resetToken = tokenIn(await lastEmailTo(email), '/reset-password');
    expect(errorCode(await verify(resetToken).expect(400))).toBe('TOKEN_INVALID');
    expect((await me(session)).emailVerifiedAt).toBeNull();
    // Trying it as a verification didn't use it up.
    await reset(resetToken).expect(204);
  });

  it('a verification link expires after 24 hours', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { email } = await signUp();
    const token = tokenIn(await lastEmailTo(email), '/verify-email');
    vi.setSystemTime(Date.now() + EMAIL_TOKEN_TTL_MS.verify + 1000);
    expect(errorCode(await verify(token).expect(400))).toBe('TOKEN_INVALID');
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('needs a session', async () => {
    expect(errorCode(await client.post('/api/auth/resend-verification').expect(401))).toBe(
      'UNAUTHORIZED',
    );
  });

  it('sends a new link at most once a minute; verifying uses up the older links too', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { email, token: session } = await signUp();
    const first = tokenIn(await lastEmailTo(email), '/verify-email');

    const tooSoon = await client.post('/api/auth/resend-verification', {}, session).expect(429);
    expect(errorCode(tooSoon)).toBe('RESEND_TOO_SOON');
    expect(tooSoon.body.details.retryAfterSeconds).toBe(RESEND_COOLDOWN_MS / 1000);
    expect(await emailsTo(email)).toHaveLength(1);

    vi.setSystemTime(Date.now() + RESEND_COOLDOWN_MS);
    await client.post('/api/auth/resend-verification', {}, session).expect(204);
    const mails = await emailsTo(email);
    expect(mails).toHaveLength(2);
    const second = tokenIn(mails[1]!, '/verify-email');
    expect(second).not.toBe(first);

    await verify(second).expect(204);
    expect(errorCode(await verify(first).expect(400))).toBe('TOKEN_INVALID');
  });

  it('refuses once the email is verified', async () => {
    const { email, token: session } = await signUp();
    await verify(tokenIn(await lastEmailTo(email), '/verify-email')).expect(204);
    const res = await client.post('/api/auth/resend-verification', {}, session).expect(409);
    expect(errorCode(res)).toBe('ALREADY_VERIFIED');
  });
});

describe('forgotten password', () => {
  it('answers the same for an unknown email, and sends nothing', async () => {
    const email = newEmail();
    const res = await forgot(email).expect(204);
    expect(res.body).toEqual({});
    expect(await emailsTo(email)).toEqual([]);
  });

  it('sends nothing to a disabled account', async () => {
    const { email } = await signUp();
    await t.prisma.user.updateMany({ data: { disabledAt: new Date() } });
    await forgot(email).expect(204);
    expect((await lastEmailTo(email)).subject).not.toContain('password');
  });

  it('a reset link sets the password once, and ends every session', async () => {
    const { email, token: firstSession } = await signUp();
    const secondSession = sessionCookie(
      await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200),
    )?.token;

    await forgot(email.toUpperCase()).expect(204);
    const mail = await lastEmailTo(email);
    expect(mail.subject).toBe('Reset your Lamp password');
    const token = tokenIn(mail, '/reset-password');

    await reset(token).expect(204);
    await client.get('/api/auth/me', firstSession).expect(401);
    await client.get('/api/auth/me', secondSession).expect(401);
    await expect(t.prisma.session.count()).resolves.toBe(0);

    await client.post('/api/auth/login', { email, password: PASSWORD }).expect(401);
    const signedIn = await client
      .post('/api/auth/login', { email, password: NEW_PASSWORD })
      .expect(200);
    // The link proved the address.
    expect(meResponseSchema.parse(signedIn.body).emailVerifiedAt).toEqual(expect.any(String));

    expect(errorCode(await reset(token, 'yet another password').expect(400))).toBe('TOKEN_INVALID');
  });

  it('a reset link expires after an hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { email } = await signUp();
    await forgot(email).expect(204);
    const token = tokenIn(await lastEmailTo(email), '/reset-password');
    vi.setSystemTime(Date.now() + EMAIL_TOKEN_TTL_MS.reset + 1000);
    expect(errorCode(await reset(token).expect(400))).toBe('TOKEN_INVALID');
    await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  });

  it('a newer link replaces an older one once used', async () => {
    const { email } = await signUp();
    await forgot(email).expect(204);
    await forgot(email).expect(204);
    const [older, newer] = (await emailsTo(email))
      .filter((m) => m.subject === 'Reset your Lamp password')
      .map((m) => tokenIn(m, '/reset-password'));
    await reset(newer!).expect(204);
    expect(errorCode(await reset(older!).expect(400))).toBe('TOKEN_INVALID');
  });

  it('refuses a common password and keeps the link usable', async () => {
    const { email } = await signUp();
    await forgot(email).expect(204);
    const token = tokenIn(await lastEmailTo(email), '/reset-password');
    expect(errorCode(await reset(token, 'qwertyuiop').expect(400))).toBe('PASSWORD_TOO_COMMON');
    await reset(token).expect(204);
  });

  it('lifts a login lockout', async () => {
    const { email } = await signUp();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) {
      await client.post('/api/auth/login', { email, password: 'not the password' }).expect(401);
    }
    await client.post('/api/auth/login', { email, password: PASSWORD }).expect(429);
    await forgot(email).expect(204);
    await reset(tokenIn(await lastEmailTo(email), '/reset-password')).expect(204);
    const res = await client.post('/api/auth/login', { email, password: NEW_PASSWORD });
    expect(res.status).toBe(200);
  });
});
