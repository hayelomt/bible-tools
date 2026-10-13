import { devices, expect, test } from '@playwright/test';

test('the saved theme is applied before the app loads', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('lamp.theme', JSON.stringify({ preset: 'midnight', mode: 'dark' })),
  );
  // Stop the app's own script, so only the inline script in index.html can set the theme.
  await page.route('**/*.js', (route) => route.abort());
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'midnight');
  await expect(html).toHaveClass('dark');
});

test('"system" follows the device, and an unknown preset falls back to Parchment', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.addInitScript(() =>
    localStorage.setItem('lamp.theme', JSON.stringify({ preset: 'neon', mode: 'system' })),
  );
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'parchment');
  await expect(html).toHaveClass('dark');
});

test('the theme demo shows every preset in both modes, and switches the page', async ({ page }) => {
  await page.goto('/dev/themes');
  for (const name of ['Parchment', 'Vellum', 'Olive', 'Slate', 'Cedar', 'Midnight']) {
    for (const mode of ['light', 'dark']) {
      await expect(page.getByRole('region', { name: `${name}, ${mode}` })).toBeVisible();
    }
  }
  await page.getByRole('button', { name: 'Cedar', exact: true }).click();
  await page.getByRole('button', { name: 'dark', exact: true }).click();
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'cedar');
  await expect(html).toHaveClass('dark');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'cedar');
});

test.describe('on a phone', () => {
  const { defaultBrowserType: _, ...phone } = devices['Pixel 7'];
  test.use(phone);

  test('every control is a 44 px touch target, with no sideways scroll', async ({ page }) => {
    await page.goto('/dev/themes');
    const slots = ['button', 'input', 'select-trigger', 'tabs-trigger'];
    const smallest = await page.evaluate((names) => {
      const heights = names.flatMap((name) =>
        [...document.querySelectorAll(`[data-slot="${name}"]`)].map(
          (element) => element.getBoundingClientRect().height,
        ),
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
