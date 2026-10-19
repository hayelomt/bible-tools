import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { rows } from './helpers.ts';

// The YouVersion importer (F21, M9-11), against the fixture made up in the guessed format
// (TECH-DESIGN §17.11) until a real export arrives (M8-05).

const FIXTURE = fileURLToPath(
  new URL('../../web/src/import/fixtures/youversion-guess.json', import.meta.url),
);

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });

interface Item {
  origin: string;
  importId: string | null;
  receivedAt: string;
  colour: string | null;
  text: string | null;
  ref: {
    display: string;
    translation?: string;
    versionLabel?: string;
    snapshotText?: string;
  } | null;
}

async function choose(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file…' }).click();
  await (await chooser).setFiles(file);
}

test('the export imports into the inbox, and a second import adds nothing', async ({ page }) => {
  await page.goto('/settings');
  await choose(page, FIXTURE);
  await expect(toast(page, 'Imported 8 into your inbox.')).toContainText(
    '1 was already there and skipped.',
  );
  await expect(page.getByRole('status').filter({ hasText: 'Imported 8' })).toBeVisible();

  const items = await rows<Item>(page, 'inboxItem');
  expect(items).toHaveLength(8);
  expect(new Set(items.map((item) => item.importId)).size).toBe(1);
  expect(items.find((item) => item.ref?.display === 'John 3:16')).toMatchObject({
    origin: 'import',
    colour: 'yellow',
    receivedAt: '2025-03-02T08:15:00.000Z',
    // From the BSB: the passage alone, its text read from the book (decision 97).
    ref: { book: 'JHN', chapter: 3, verseStart: 16, display: 'John 3:16' },
  });
  expect(items.find((item) => item.ref?.display === 'John 3:16')?.ref).not.toHaveProperty(
    'translation',
  );
  expect(items.find((item) => item.ref?.display === 'Philippians 4:13')?.ref).toMatchObject({
    translation: 'shared',
    versionLabel: 'NIV',
    snapshotText: 'I can do all this through him who gives me strength.',
  });

  // In the inbox, the import is one row, which opens its items oldest first.
  await toast(page, 'Imported 8').getByRole('button', { name: 'Open inbox' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  await expect(page.getByRole('article')).toHaveCount(0);
  await page.getByRole('link', { name: /^YouVersion import · \w{3} \d+ \w{3}, 8 items$/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^YouVersion import · /);
  await expect(page.getByRole('article')).toHaveCount(8);
  await expect(page.getByRole('article').first()).toContainText('Imported · ');
  await expect(page.getByRole('article', { name: 'Isaiah 40:31' })).toContainText('ESV');
  await page.getByRole('link', { name: 'Back' }).click();

  // Again, from the Inbox's ⋯.
  await page.getByRole('button', { name: 'Inbox actions' }).click();
  await page.getByRole('menuitem', { name: 'Import from YouVersion…' }).click();
  await choose(page, FIXTURE);
  await expect(page.getByRole('dialog')).toContainText('Nothing new: all 9 were already imported.');
  expect(await rows(page, 'inboxItem')).toHaveLength(8);
});

test('an import is dismissed all at once, after asking, with Undo', async ({ page }) => {
  await page.goto('/settings');
  await choose(page, FIXTURE);
  await expect(toast(page, 'Imported 8')).toBeVisible();
  await page.goto('/inbox');
  await page.getByRole('textbox', { name: 'Add a verse or a note' }).fill('My own note');
  await page.keyboard.press('Enter');
  await page.getByRole('link', { name: /^YouVersion import/ }).click();

  // One goes to a lesson first; it stays there.
  const john = page.getByRole('article', { name: 'John 3:16' });
  await john.getByRole('button', { name: 'Send to lesson' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Sent to John 3:16.')).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(7);

  await page.getByRole('button', { name: 'Import actions' }).click();
  await page.getByRole('menuitem', { name: 'Dismiss all from this import…' }).click();
  const ask = page.getByRole('dialog', { name: /^Dismiss 7 items from the YouVersion import of / });
  await expect(ask).toContainText('Items you’ve already put in a lesson stay there.');
  await expect(ask.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await ask.getByRole('button', { name: 'Dismiss all 7' }).click();

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  await expect(page.getByRole('link', { name: /^YouVersion import/ })).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'My own note' })).toBeVisible();
  // Live: the one placed, and the note that wasn't imported.
  const items = await rows<Item & { placedInSectionId: string | null }>(page, 'inboxItem');
  expect(items).toHaveLength(2);
  expect(items.find((item) => item.ref?.display === 'John 3:16')).toMatchObject({
    placedInSectionId: expect.any(String),
  });

  await toast(page, 'Dismissed 7 items.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: /^YouVersion import · .*, 7 items$/ })).toBeVisible();
});

test('a file that isn’t an export says so and adds nothing', async ({ page }) => {
  await page.goto('/settings');
  await choose(page, {
    name: 'notes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ hello: 'world' })),
  });
  await expect(page.locator('[data-slot="alert"]')).toContainText(
    'This isn’t a YouVersion export Lamp can read.',
  );
  await choose(page, {
    name: 'photo.json',
    mimeType: 'application/json',
    buffer: Buffer.from('not json'),
  });
  await expect(page.locator('[data-slot="alert"]')).toContainText('Nothing was imported.');
  expect(await rows(page, 'inboxItem')).toEqual([]);
});
