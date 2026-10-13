import { apiErrorSchema, healthResponseSchema } from '@lamp/domain';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';

// The pattern for endpoint tests: one real app per file, a clean database for every test.
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
});

describe('GET /api/health', () => {
  it('returns ok once the real database answers', async () => {
    const res = await request(t.server).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', version: pkg.version });
    expect(healthResponseSchema.safeParse(res.body).success).toBe(true);
  });

  it('answers an unknown route with the shared error body', async () => {
    const res = await request(t.server).get('/api/nothing-here').expect(404);
    expect(apiErrorSchema.parse(res.body)).toMatchObject({
      statusCode: 404,
      errorCode: 'NOT_FOUND',
    });
  });

  it('runs against lamp_test, which starts every test empty', async () => {
    const rows = await t.prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
    expect(rows[0]?.db).toMatch(/_test$/);
    await expect(t.prisma.user.count()).resolves.toBe(0);
  });
});
