import { expect, test } from '@playwright/test';

test('the built API is up and reaches lamp_e2e', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ status: 'ok', version: expect.any(String) });
});
