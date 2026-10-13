import { expect, type Page, test } from '@playwright/test';

/** Settings, with the theme sheet open. */
async function openThemeSheet(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: /^Theme/ }).click();
  return page.getByRole('dialog', { name: 'Theme' });
}

const PRESETS = ['Parchment', 'Vellum', 'Olive', 'Slate', 'Cedar', 'Midnight'];

test('every preset and mode is stored, and applied before the first paint on reload', async ({
  page,
}) => {
  const html = page.locator('html');
  for (const mode of ['Light', 'Dark']) {
    for (const preset of PRESETS) {
      const id = preset.toLowerCase();
      const sheet = await openThemeSheet(page);
      await sheet.getByRole('radio', { name: mode, exact: true }).click();
      await sheet.getByRole('radio', { name: preset }).click();
      await expect(sheet.getByRole('radio', { name: preset })).toBeChecked();
      await expect(html).toHaveAttribute('data-theme', id);

      // With the app's scripts blocked, only the inline script in index.html can set the theme.
      await page.route('**/*.js', (route) => route.abort());
      await page.reload();
      await expect(html).toHaveAttribute('data-theme', id);
      if (mode === 'Dark') await expect(html).toHaveClass('dark');
      else await expect(html).not.toHaveClass('dark');
      await page.unroute('**/*.js');

      // The choice itself lives in the local UserSettings, not only in the mirror.
      const reopened = await openThemeSheet(page);
      await expect(reopened.getByRole('radio', { name: preset })).toBeChecked();
      await expect(reopened.getByRole('radio', { name: mode, exact: true })).toBeChecked();
    }
  }
});

test('"System" follows the device as it changes', async ({ page }) => {
  const html = page.locator('html');
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/settings');
  await page.getByRole('radio', { name: 'System' }).click();
  await expect(html).not.toHaveClass('dark');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html).toHaveClass('dark');
});

test('Midnight in light mode suggests dark mode', async ({ page }) => {
  const sheet = await openThemeSheet(page);
  await sheet.getByRole('radio', { name: 'Light', exact: true }).click();
  await sheet.getByRole('radio', { name: 'Midnight' }).click();
  await sheet.getByRole('button', { name: 'Use dark mode' }).click();
  await expect(sheet.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(sheet.getByRole('button', { name: 'Use dark mode' })).toBeHidden();
});

for (const [name, viewport] of [
  ['phone', { width: 360, height: 740 }],
  ['laptop', { width: 1280, height: 800 }],
] as const) {
  test(`on a ${name}, the sheet opens from settings and closes with Esc or ×`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const sheet = await openThemeSheet(page);
    await expect(sheet).toBeVisible();
    // Bottom-aligned, and never wider than the column (42 rem).
    // Measured once it has finished sliding in.
    await expect
      .poll(async () => {
        const box = (await sheet.boundingBox())!;
        return Math.round(box.y + box.height);
      })
      .toBe(viewport.height);
    expect((await sheet.boundingBox())!.width).toBeLessThanOrEqual(42 * 16);
    // The looks come first, so the presets may be below the fold: the sheet scrolls inside.
    const cedar = sheet.getByRole('radio', { name: 'Cedar' });
    await cedar.scrollIntoViewIfNeeded();
    await expect(cedar).toBeInViewport();

    await sheet.getByRole('radio', { name: 'Olive' }).click();
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    const row = page.getByRole('button', { name: /^Theme/ });
    await expect(row).toHaveText(/Olive/);
    await expect(row).toBeFocused();

    await row.click();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toBeHidden();
    expect(new URL(page.url()).pathname).toBe('/settings');
  });
}
