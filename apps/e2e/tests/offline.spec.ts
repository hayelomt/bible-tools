import { expect, test } from '@playwright/test';
import { newLesson } from './helpers.ts';

// The app as installed: its service worker runs (other specs block it).
test.use({ serviceWorkers: 'allow' });

test('is installable, with a name and icons', async ({ page }) => {
  await page.goto('/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = (await (await page.request.get(href!)).json()) as {
    name: string;
    display: string;
    start_url: string;
    icons: { sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({ name: 'Lamp', display: 'standalone', start_url: '/' });
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: '192x192' }),
      expect.objectContaining({ sizes: '512x512' }),
      expect.objectContaining({ purpose: 'maskable' }),
    ]),
  );
});

test('in airplane mode after the first load, every screen works and any book opens', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await newLesson(page, 'Obadiah');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

  // The Bible downloads in the background, with its progress in settings.
  await page.goto('/settings');
  const bible = page.getByRole('region', { name: 'Bible' });
  await expect(bible).toContainText('World English Bible');
  await expect(bible.getByLabel('Downloaded')).toBeVisible({ timeout: 30_000 });
  await expect(bible).toContainText('4.1 MB');
  await expect(page.getByRole('region', { name: 'Storage' })).toContainText(/MB used/);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  for (const title of ['Read', 'Search', 'Review', 'Lessons']) {
    await page.getByRole('link', { name: title, exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
  }

  // Straight to an address, as from a bookmark: the same page, from the service worker.
  await page.goto('/review');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review');
  await page.goto('/');
  await page.getByRole('link', { name: /Obadiah/ }).click();
  const note = page.getByRole('textbox', { name: 'Note', exact: true }).first();
  await note.click();

  // A book never opened before is here.
  await page.keyboard.type('Obad 1:15');
  const list = page.getByRole('listbox', { name: 'Verse suggestions' });
  await expect(list).toContainText('For the day of Yahweh is near all the nations!');
  await page.keyboard.press('Enter');
  await expect(note).toHaveText('Obadiah 15 · WEB ');
});
