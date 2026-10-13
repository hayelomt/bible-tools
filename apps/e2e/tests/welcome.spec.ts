import { expect, test } from '@playwright/test';

// A new device: without the `lamp.welcomed` flag the config sets for every other test.
test.use({ storageState: { cookies: [], origins: [] } });

test('a new device picks a look and mode first, then lands on the first-run home', async ({
  page,
}) => {
  await page.goto('/');
  const welcome = page.getByRole('region', { name: 'Welcome to Lamp' });
  await expect(welcome.getByRole('radio', { name: 'Classic' })).toBeChecked();
  await expect(welcome.getByRole('radio', { name: 'System' })).toBeChecked();

  await welcome.getByRole('radio', { name: 'Folio' }).click();
  await welcome.getByRole('radio', { name: 'Dark', exact: true }).click();
  const html = page.locator('html');
  // Applied once its stylesheet has arrived, never half-loaded.
  await expect(html).toHaveAttribute('data-look', 'folio');
  await expect(html).toHaveClass('dark');
  await expect(page.locator('link#lamp-look')).toHaveCount(1);

  await welcome.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Your notes start here.')).toBeVisible();

  // With the app's scripts blocked, only the inline script can show the look before first paint.
  await page.route('**/*.js', (route) => route.abort());
  await page.reload();
  await expect(html).toHaveAttribute('data-look', 'folio');
  await expect(html).toHaveClass('dark');
  // Folio's corners, compared as a number: the built stylesheet writes it as `.125rem`.
  expect(
    await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--radius')),
    ),
  ).toBe(0.125);
  await page.unroute('**/*.js');

  // Done once per device.
  await page.reload();
  await expect(page.getByText('Your notes start here.')).toBeVisible();
});

test('the theme sheet switches between looks; presets are only for Classic', async ({ page }) => {
  await page.goto('/');
  await page
    .getByRole('region', { name: 'Welcome to Lamp' })
    .getByRole('button', { name: 'Continue' })
    .click();
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Theme/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Theme' });
  await expect(sheet.getByRole('radio', { name: 'Cedar' })).toBeVisible();

  await sheet.getByRole('radio', { name: 'Folio' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-look', 'folio');
  await expect(sheet.getByRole('radio', { name: 'Cedar' })).toBeHidden();

  await sheet.getByRole('radio', { name: 'Classic' }).click();
  await expect(page.locator('html')).not.toHaveAttribute('data-look');
  await expect(page.locator('link#lamp-look')).toHaveCount(0);
  await expect(sheet.getByRole('radio', { name: 'Cedar' })).toBeVisible();
});
