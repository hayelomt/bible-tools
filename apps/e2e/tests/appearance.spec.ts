import { devices, expect, test } from '@playwright/test';

test('the saved mode is applied before the app loads', async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem('lamp.theme', JSON.stringify({ mode: 'dark' })),
  );
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
    // The mirror is written once the setting is saved, a moment after the click.
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem('lamp.theme')))
      .toContain(`"${mode === 'Auto' ? 'system' : mode.toLowerCase()}"`);

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

test('density and text size apply at once, and before the first paint on reload', async ({
  page,
}) => {
  const html = page.locator('html');
  await page.goto('/settings');
  const fontSize = () =>
    page.getByRole('radio', { name: 'Roomy' }).evaluate((radio) => {
      const label = radio.closest('label') as HTMLElement;
      return parseFloat(getComputedStyle(label).fontSize);
    });
  const height = () =>
    page
      .getByRole('radio', { name: 'Roomy' })
      .evaluate((radio) => (radio.closest('label') as HTMLElement).offsetHeight);
  const [defaultSize, defaultHeight] = [await fontSize(), await height()];

  await page.getByRole('radio', { name: 'Compact' }).click();
  await page.getByRole('radio', { name: 'Larger' }).click();
  await expect(html).toHaveAttribute('data-density', 'compact');
  await expect(html).toHaveAttribute('data-text-size', 'larger');
  expect(await fontSize()).toBeCloseTo(defaultSize * 1.25);
  expect(await height()).toBeLessThan(defaultHeight);
  expect(await page.evaluate(() => localStorage.getItem('lamp.display'))).toBe(
    '{"density":"compact","textSize":"larger"}',
  );

  // With the app's scripts blocked, only the inline script in index.html can apply them.
  await page.route('**/*.js', (route) => route.abort());
  await page.reload();
  await expect(html).toHaveAttribute('data-density', 'compact');
  await expect(html).toHaveAttribute('data-text-size', 'larger');
  await page.unroute('**/*.js');

  await page.goto('/settings');
  await expect(page.getByRole('radio', { name: 'Compact' })).toBeChecked();
  await page.getByRole('radio', { name: 'Default' }).first().click();
  await page.getByRole('radio', { name: 'Default' }).last().click();
  await expect(html).not.toHaveAttribute('data-density');
  await expect(html).not.toHaveAttribute('data-text-size');
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

  for (const display of [
    { density: 'dense', textSize: 'larger' },
    { density: 'dense', textSize: 'tiny' },
  ]) {
    test(`${display.density} with ${display.textSize} text keeps 44 px touch targets, with no sideways scroll`, async ({
      page,
    }) => {
      await page.addInitScript(
        (value) => localStorage.setItem('lamp.display', value),
        JSON.stringify(display),
      );
      await page.goto('/settings');
      const smallest = await page.evaluate(() =>
        Math.min(
          ...[...document.querySelectorAll('[data-slot="button"], input[type="radio"]')]
            .filter((element) => element.checkVisibility())
            .map((element) => (element.closest('label') ?? element).getBoundingClientRect().height),
        ),
      );
      expect(smallest).toBeGreaterThanOrEqual(44);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBe(0);
    });
  }
});
