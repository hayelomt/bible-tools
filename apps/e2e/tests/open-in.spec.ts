import { expect, type Page, test } from '@playwright/test';
import { newLesson } from './helpers.ts';

// "Open in…" (F20, M9-10): a chip's passage in other apps, from the target table, in the order
// and with the targets the user chose in Settings.

const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();
const openIn = (page: Page) => page.getByRole('region', { name: 'Open in' });

/** A lesson with a Romans 8:28–30 chip, opened in the verse sheet. */
async function openChip(page: Page) {
  await page.goto('/');
  await newLesson(page, 'Romans 8');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();
  await page.keyboard.type('Rom 8:28-30');
  await expect(page.getByRole('option', { name: /^Romans 8:28–30/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: /^Romans 8:28–30, Berean Standard Bible/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Berean Standard Bible');
}

test('a chip opens in each target, with its translation where the target has it', async ({
  page,
}) => {
  await openChip(page);
  const links = openIn(page).getByRole('link');
  await expect(links).toHaveText([/^Blue Letter Bible/, /^YouVersion/, /^Bible Hub/, /^Logos/]);
  const hrefs = await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')));
  expect(hrefs).toEqual([
    // No BSB there: the KJV.
    'https://www.blueletterbible.org/kjv/rom/8/28-30/',
    'https://www.bible.com/bible/3034/ROM.8.28-30',
    // No ranges: the first verse.
    'https://biblehub.com/bsb/romans/8.htm#28',
    'https://ref.ly/Ro8.28-30;kjv',
  ]);
  await expect(links.first()).toHaveAttribute('target', '_blank');
  await expect(links.first()).toHaveAttribute('rel', 'noopener noreferrer');
});

test('Settings → Open in hides and reorders the targets', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Open in other apps ›' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Open in');

  await page.getByRole('switch', { name: 'Show Bible Hub' }).click();
  await expect(page.getByRole('switch', { name: 'Show Bible Hub' })).not.toBeChecked();
  // Logos to the top, with the menu (the keyboard's way to move).
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: /^Move Logos/ }).click();
    await page.getByRole('menuitem', { name: 'Move up' }).click();
  }
  await expect(page.getByRole('button', { name: /^Move Logos/ })).toHaveAccessibleName(
    'Move Logos, shown, 1 of 3',
  );

  await openChip(page);
  await expect(openIn(page).getByRole('link')).toHaveText([
    /^Logos/,
    /^Blue Letter Bible/,
    /^YouVersion/,
  ]);

  // With every target hidden, the block goes.
  await page.goto('/settings/open-in');
  for (const name of ['Logos', 'Blue Letter Bible', 'YouVersion']) {
    await page.getByRole('switch', { name: `Show ${name}` }).click();
  }
  for (const name of ['Logos', 'Blue Letter Bible', 'YouVersion', 'Bible Hub']) {
    await expect(page.getByRole('switch', { name: `Show ${name}` })).not.toBeChecked();
  }
  await openChip(page);
  await expect(openIn(page)).toHaveCount(0);
});

test('a changed target table is used on the next start, and kept for offline', async ({ page }) => {
  await page.route('**/open-in.json', async (route) => {
    const response = await route.fetch();
    const table = (await response.json()) as {
      targets: { key: string; name: string; links: Record<string, string> }[];
    };
    const youVersion = table.targets.find((t) => t.key === 'youversion')!;
    youVersion.name = 'YouVersion (new links)';
    youVersion.links.range =
      'https://www.bible.com/bible/{version}/{book}.{chapter}.{verse}-{verseEnd}.NEW';
    await route.fulfill({ response, json: table });
  });
  await openChip(page);
  const youVersion = openIn(page).getByRole('link', { name: /^YouVersion \(new links\)/ });
  await expect(youVersion).toHaveAttribute(
    'href',
    'https://www.bible.com/bible/3034/ROM.8.28-30.NEW',
  );

  // When the table can't be fetched (offline), the last one fetched stays in use.
  await page.unroute('**/open-in.json');
  await page.route('**/open-in.json', (route) => route.abort('internetdisconnected'));
  await page.reload();
  await page.getByRole('button', { name: /^Romans 8:28–30, Berean Standard Bible/ }).click();
  await expect(openIn(page).getByRole('link', { name: /^YouVersion \(new links\)/ })).toBeVisible();
});
