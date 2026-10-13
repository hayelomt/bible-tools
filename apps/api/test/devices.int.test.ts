import { apiErrorSchema, devicesResponseSchema, newId } from '@lamp/domain';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient, sessionCookie } from './int/http.js';
import { runEmail } from './int/mail.js';
import { lessonRow, upsert } from './int/sync.js';

/** `GET /api/account/devices` and `DELETE /api/account/devices/:id` (§6.6). */

let t: TestApp;
let client: Client;

const PASSWORD = 'a lamp to my feet';
const PHONE = { id: '0199e0a0-0000-7000-8000-0000000000a1', name: 'Chrome on Android' };
const LAPTOP = { id: '0199e0a0-0000-7000-8000-0000000000a2', name: 'Firefox on macOS' };
type DeviceOf = typeof PHONE;

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

/** A verified account signed in on two devices (two sessions); nothing has synced yet. */
async function account(email = runEmail('devices')) {
  const signup = await client.post('/api/auth/signup', { email, password: PASSWORD }).expect(201);
  const userId = (signup.body as { id: string }).id;
  await t.prisma.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
  return { email, userId, phone: sessionCookie(signup)?.token ?? '', laptop: await signIn(email) };
}

async function signIn(email: string): Promise<string> {
  const res = await client.post('/api/auth/login', { email, password: PASSWORD }).expect(200);
  return sessionCookie(res)?.token ?? '';
}

const pull = (token: string, device: DeviceOf, clientVersion = '0.0.0') => {
  const query = new URLSearchParams({
    cursor: '0',
    clientVersion,
    deviceId: device.id,
    deviceName: device.name,
  });
  return client.get(`/api/sync/pull?${query}`, token);
};

const push = (token: string, device: DeviceOf, clientVersion = '0.0.0') =>
  client.post(
    '/api/sync/push',
    {
      deviceId: device.id,
      deviceName: device.name,
      clientVersion,
      changes: [upsert('lesson', lessonRow())],
    },
    token,
  );

async function devices(token: string) {
  const res = await client.get('/api/account/devices', token).expect(200);
  return devicesResponseSchema.parse(res.body).devices;
}

const signOut = (token: string, id: string) =>
  client.delete(`/api/account/devices/${id}`, undefined, token);

describe('GET /api/account/devices', () => {
  it('needs a session', async () => {
    const res = await client.get('/api/account/devices').expect(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('lists a device from its first sync, with its name, version and last sync', async () => {
    const { phone } = await account();
    await expect(devices(phone)).resolves.toEqual([]);

    const before = Date.now();
    await pull(phone, PHONE).expect(200);
    const [listed] = await devices(phone);
    expect(listed).toMatchObject({ ...PHONE, clientVersion: '0.0.0' });
    expect(Date.parse(listed!.lastSyncAt!)).toBeGreaterThanOrEqual(before - 1000);
    expect(listed!.createdAt).toBe(listed!.lastSyncAt);

    // A push updates the name and version, and keeps when it was first seen.
    await push(phone, { ...PHONE, name: 'Chrome on Android tablet' }, '0.2.0').expect(200);
    const [again] = await devices(phone);
    expect(again).toMatchObject({
      name: 'Chrome on Android tablet',
      clientVersion: '0.2.0',
      createdAt: listed!.createdAt,
    });
  });

  it('lists every signed-in device, most recently synced first, and no other account’s', async () => {
    const { phone, laptop } = await account();
    const other = await account();
    await push(laptop, LAPTOP).expect(200);
    await pull(phone, PHONE).expect(200);
    await pull(other.phone, { ...PHONE, id: newId() }).expect(200);

    expect((await devices(laptop)).map((d) => d.name)).toEqual([PHONE.name, LAPTOP.name]);
    await expect(devices(other.phone)).resolves.toHaveLength(1);
  });

  it('records nothing for a sync that is refused', async () => {
    const unverified = await client
      .post('/api/auth/signup', { email: runEmail('devices'), password: PASSWORD })
      .expect(201);
    const token = sessionCookie(unverified)?.token ?? '';
    await pull(token, PHONE).expect(403);
    await push(token, PHONE).expect(403);
    await expect(t.prisma.device.count()).resolves.toBe(0);
  });

  it('drops devices signed out by a password change, until they sync again', async () => {
    const { email, phone, laptop } = await account();
    await pull(phone, PHONE).expect(200);
    await pull(laptop, LAPTOP).expect(200);
    await client
      .post(
        '/api/auth/change-password',
        { currentPassword: PASSWORD, newPassword: 'a light to my path' },
        phone,
      )
      .expect(204);
    expect((await devices(phone)).map((d) => d.id)).toEqual([PHONE.id]);

    const laptopAgain = await client
      .post('/api/auth/login', { email, password: 'a light to my path' })
      .expect(200);
    await pull(sessionCookie(laptopAgain)?.token ?? '', LAPTOP).expect(200);
    expect((await devices(phone)).map((d) => d.id)).toEqual([LAPTOP.id, PHONE.id]);
  });
});

describe('DELETE /api/account/devices/:id', () => {
  it('signs the device out: its next sync gets 401, and the other device carries on', async () => {
    const { email, phone, laptop } = await account();
    await pull(phone, PHONE).expect(200);
    await pull(laptop, LAPTOP).expect(200);

    const res = await signOut(phone, LAPTOP.id).expect(204);
    // Another device's sign-out leaves this device's cookie alone.
    expect(sessionCookie(res)).toBeUndefined();

    expect(errorCode(await pull(laptop, LAPTOP).expect(401))).toBe('UNAUTHORIZED');
    await push(laptop, LAPTOP).expect(401);
    await client.get('/api/auth/me', laptop).expect(401);
    expect((await devices(phone)).map((d) => d.id)).toEqual([PHONE.id]);
    await pull(phone, PHONE).expect(200);

    // Signing in there again and syncing brings it back, as first recorded.
    const created = (await t.prisma.device.findFirstOrThrow({ where: { id: LAPTOP.id } }))
      .createdAt;
    await pull(await signIn(email), LAPTOP).expect(200);
    const back = (await devices(phone)).find((d) => d.id === LAPTOP.id);
    expect(back?.createdAt).toBe(created.toISOString());
  });

  it('ends every session of that device', async () => {
    const { email, phone, laptop } = await account();
    const laptopTab = await signIn(email);
    await pull(laptop, LAPTOP).expect(200);
    await pull(laptopTab, LAPTOP).expect(200);
    await signOut(phone, LAPTOP.id).expect(204);
    await client.get('/api/auth/me', laptop).expect(401);
    await client.get('/api/auth/me', laptopTab).expect(401);
    await client.get('/api/auth/me', phone).expect(200);
    await expect(t.prisma.session.count({ where: { deviceId: LAPTOP.id } })).resolves.toBe(0);
  });

  it('signing out this device clears its cookie', async () => {
    const { phone } = await account();
    await pull(phone, PHONE).expect(200);
    const res = await signOut(phone, PHONE.id).expect(204);
    expect(sessionCookie(res)?.token).toBe('');
    await client.get('/api/auth/me', phone).expect(401);
  });

  it("answers 404 for a device that isn't signed in to this account", async () => {
    const { phone } = await account();
    const other = await account();
    await pull(other.phone, PHONE).expect(200);
    expect(errorCode(await signOut(phone, PHONE.id).expect(404))).toBe('NOT_FOUND');
    expect(errorCode(await signOut(phone, newId()).expect(404))).toBe('NOT_FOUND');
    // The other account's device is untouched.
    await pull(other.phone, PHONE).expect(200);
  });

  it('needs a session and a device id', async () => {
    await signOut('', PHONE.id).expect(401);
    const { phone } = await account();
    expect(errorCode(await signOut(phone, 'phone').expect(400))).toBe('VALIDATION_FAILED');
  });
});
