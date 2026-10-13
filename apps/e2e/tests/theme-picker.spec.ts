import { expect, test } from '@playwright/test';

const PRESETS = ['Parchment', 'Vellum', 'Olive', 'Slate', 'Cedar', 'Midnight'];

test('every preset and mode is stored, and applied before the first paint on reload', async ({
  page,
}) => {
  const html = page.locator('html');
  await page.goto('/settings/theme');
  for (const mode of ['Light', 'Dark']) {
    await page.getByRole('radio', { name: mode, exact: true }).click();
    for (const preset of PRESETS) {
      const id = preset.toLowerCase();
      await page.getByRole('radio', { name: preset }).click();
      await expect(page.getByRole('radio', { name: preset })).toBeChecked();
      await expect(html).toHaveAttribute('data-theme', id);

      // With the app's scripts blocked, only the inline script in index.html can set the theme.
      await page.route('**/*.js', (route) => route.abort());
      await page.reload();
      await expect(html).toHaveAttribute('data-theme', id);
      if (mode === 'Dark') await expect(html).toHaveClass('dark');
      else await expect(html).not.toHaveClass('dark');
      await page.unroute('**/*.js');

      // The choice itself lives in the local UserSettings, not only in the mirror.
      await page.reload();
      await expect(page.getByRole('radio', { name: preset })).toBeChecked();
      await expect(page.getByRole('radio', { name: mode, exact: true })).toBeChecked();
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
  await page.goto('/settings/theme');
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await page.getByRole('radio', { name: 'Midnight' }).click();
  await page.getByRole('button', { name: 'Use dark mode' }).click();
  await expect(page.getByRole('radio', { name: 'Dark', exact: true })).toBeChecked();
  await expect(page.locator('html')).toHaveClass('dark');
  await expect(page.getByRole('button', { name: 'Use dark mode' })).toBeHidden();
});

test('settings link to the picker and name the current preset', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: /^Theme/ }).click();
  await page.getByRole('radio', { name: 'Olive' }).click();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('link', { name: /^Theme/ })).toHaveText(/Olive/);
});
