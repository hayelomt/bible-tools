import { hash } from '@node-rs/argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';

// The config is read when AppModule is first imported, and each test file has its own modules,
// so the switch is set before the app is imported.
let t: TestApp;
let client: Client;

beforeAll(async () => {
  process.env.SIGNUP_ENABLED = 'false';
  const { createTestApp } = await import('./int/app.js');
  t = await createTestApp();
  await truncateAll(t.prisma);
  client = await createClient(t);
});

afterAll(async () => {
  delete process.env.SIGNUP_ENABLED;
  await t.app.close();
});

describe('SIGNUP_ENABLED=false', () => {
  it('refuses sign-up and creates nothing', async () => {
    const res = await client
      .post('/api/auth/signup', { email: 'reader@example.com', password: 'a lamp to my feet' })
      .expect(403);
    expect(res.body.errorCode).toBe('SIGNUP_DISABLED');
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });

  it('still lets existing accounts sign in', async () => {
    await t.prisma.user.create({
      data: { email: 'family@example.com', passwordHash: await hash('a lamp to my feet') },
    });
    const res = await client.post('/api/auth/login', {
      email: 'family@example.com',
      password: 'a lamp to my feet',
    });
    expect(res.status).toBe(200);
  });
});
