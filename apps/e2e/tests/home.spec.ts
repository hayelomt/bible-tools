import { expect, test } from '@playwright/test';

test('the home page shows the API status through the /api proxy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Lamp' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText(/^Server ok · v\d+\.\d+\.\d+/);
});
