import { devices, expect, test } from '@playwright/test';

test('the saved mode is applied before the app loads', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('lamp.theme', JSON.stringify({ mode: 'dark' })));
  // Stop the app's own script, so only the inline script in index.html can set the mode.
  await page.route('**/*.js', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('html')).toHaveClass('dark');
});

test('a choice saved before the single theme keeps its mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.addInitScript(() =>
    localStorage.setItem(
      'lamp.theme',
      JSON.stringify({ preset: 'midnight', mode: 'dark', look: 'folio', lookHref: '/x.css' }),
    ),
  );
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveClass('dark');
  await expect(html).not.toHaveAttribute('data-look');
  await expect(page.locator('link#lamp-look')).toHaveCount(0);
});

test('every mode is stored, and applied before the first paint on reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  const html = page.locator('html');
  for (const mode of ['Dark', 'Light', 'Auto']) {
    await page.goto('/settings');
    await page.getByRole('radio', { name: mode, exact: true }).click();

    // With the app's scripts blocked, only the inline script in index.html can set the mode.
    await page.route('**/*.js', (route) => route.abort());
    await page.reload();
    if (mode === 'Dark') await expect(html).toHaveClass('dark');
    else await expect(html).not.toHaveClass('dark');
    await page.unroute('**/*.js');

    // The choice itself lives in the local UserSettings, not only in the mirror.
    await page.goto('/settings');
    await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked();
  }
});

test('Auto follows the device as it changes', async ({ page }) => {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'Auto' }).click();
  await expect(html).not.toHaveClass('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass('dark');
});

test.describe('on a phone', () => {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  test.use(phone);

  test('every control is a 44 px touch target, with no sideways scroll', async ({ page }) => {
    await page.goto('/settings');
    const slots = ['button', 'input', 'select-trigger', 'tabs-trigger'];
    const smallest = await page.evaluate((names) => {
      const heights = names.flatMap((name) =>
        [...document.querySelectorAll(`[data-slot="${name}"]`)]
          .filter((element) => element.checkVisibility())
          .map((element) => element.getBoundingClientRect().height),
      );
      return Math.min(...heights);
    }, slots);
    expect(smallest).toBeGreaterThanOrEqual(44);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
  });
});
