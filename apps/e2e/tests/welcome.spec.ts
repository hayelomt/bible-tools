import { expect, test } from '@playwright/test';

// A new device: without the `lamp.welcomed` flag the config sets for every other test.
test.use({ storageState: { cookies: [], origins: [] } });

test('a new device picks a mode first, then lands on the first-run home', async ({ page }) => {
  await page.goto('/');
  const welcome = page.getByRole('region', { name: 'Welcome to Lamp' });
  await expect(welcome.getByRole('radio', { name: 'Auto' })).toBeChecked();

  await welcome.getByRole('radio', { name: 'Dark', exact: true }).click();
  const html = page.locator('html');
  await expect(html).toHaveClass('dark');

  await welcome.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Your notes start here.')).toBeVisible();

  // With the app's scripts blocked, only the inline script can set the mode before first paint.
  await page.route('**/*.js', (route) => route.abort());
  await page.reload();
  await expect(html).toHaveClass('dark');
  await page.unroute('**/*.js');

  // Done once per device.
  await page.reload();
  await expect(page.getByText('Your notes start here.')).toBeVisible();
});
