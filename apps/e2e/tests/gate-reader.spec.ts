import { expect, type Page, test } from '@playwright/test';
import { rows } from './helpers.ts';

// The M5 gate (PRD Milestones D): scripture is read, highlighted and promoted inside the app. On a
// phone with no connection, after the Bible downloaded: a chapter from the picker, two verses
// highlighted, one added to a new lesson, and that note found again from the verse index.
test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

const verse = (page: Page, n: number) => page.locator(`[data-verse="${n}"]`);
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected verses' });
const tab = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name, exact: true });

test('a verse read offline is highlighted, added to a new lesson and found by verse', async ({
  page,
  context,
}) => {
  // Installed and the Bible downloaded, on an earlier visit.
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Bible' }).getByLabel('Downloaded')).toBeVisible({
    timeout: 30_000,
  });

  // No connection from here on. Romans 8 from the picker.
  await context.setOffline(true);
  await tab(page, 'Read').click();
  await page.getByRole('button', { name: 'John 1' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a passage' })
    .getByRole('searchbox', { name: 'Filter books' })
    .fill('rom');
  await page.keyboard.press('Enter');
  await page
    .getByRole('dialog', { name: 'Romans' })
    .getByRole('link', { name: '8', exact: true })
    .click();
  await expect(page).toHaveURL(/\/read\/ROM\.8$/);
  await expect(verse(page, 28)).toContainText('God works all things together for the good');

  // Two verses highlighted: 1 in green, 28 in yellow with a note.
  await verse(page, 1).click();
  await bar(page).getByRole('button', { name: 'Green' }).click();
  await expect(verse(page, 1)).toContainText('Highlighted green');
  await bar(page).getByRole('button', { name: 'Clear selection' }).click();

  await verse(page, 28).click();
  await bar(page).getByRole('button', { name: 'Yellow' }).click();
  await bar(page).getByRole('button', { name: 'Note' }).click();
  await page.getByRole('textbox', { name: 'Note on Romans 8:28' }).fill('Even this season');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(verse(page, 28)).toContainText('Highlighted yellow');
  await expect(verse(page, 28)).toContainText('Note: Even this season');
  await expect.poll(async () => (await rows(page, 'highlight')).length).toBe(2);

  // Verse 28 into a new lesson; there are no lessons yet to choose from.
  await bar(page).getByRole('button', { name: 'Add to lesson' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add Romans 8:28 to a lesson' });
  await expect(dialog.getByRole('radio', { name: 'New lesson “Romans 8:28”' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Added to Romans 8:28.')).toBeVisible();
  // Only the note's verse is marked; a highlight alone isn't a note.
  await expect(page.getByRole('link', { name: /^Notes on / })).toHaveCount(1);
  await expect(page.getByRole('link', { name: 'Notes on Romans 8:28' })).toBeVisible();

  // Still there after a reload, offline.
  await page.reload();
  await expect(verse(page, 1)).toContainText('Highlighted green');
  await expect(verse(page, 28)).toContainText('Highlighted yellow');

  // Found again by verse: Search, then the verse index, then the lesson.
  await tab(page, 'Search').click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('rom 8:28');
  await page.getByRole('link', { name: 'Verse index for Romans 8:28' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Romans 8:28');
  await expect(page.getByText('1 note · main passage of 1 lesson · 1 highlight')).toBeVisible();
  const entries = page.getByRole('main').getByRole('listitem');
  await expect(entries).toHaveCount(3);
  await expect(entries.filter({ hasText: 'Even this season' })).toHaveCount(2);

  // The chapter's index has both highlights.
  await page.goto('/verses/ROM.8?show=highlights');
  await expect(entries).toHaveCount(2);
  await expect(entries.filter({ hasText: 'Romans 8:1' })).toContainText('green');
  await expect(entries.filter({ hasText: 'Romans 8:28' })).toContainText('yellow');

  // The note opens in its lesson, with the verse chip and the note.
  await page.goto('/verses/ROM.8.28?show=notes');
  await entries.filter({ hasText: 'Even this season' }).getByRole('link').first().click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Romans 8:28');
  await expect(page.getByText('Romans 8:28 · BSB').first()).toBeVisible();
  await expect(page.getByText('Even this season')).toBeVisible();

  const [section] = await rows<{ id: string; lessonId: string }>(page, 'section');
  const highlights = await rows<{ colour: string; promotedSectionId: string | null }>(
    page,
    'highlight',
  );
  expect(highlights.find((h) => h.colour === 'yellow')?.promotedSectionId).toBe(section!.id);
  expect(highlights.find((h) => h.colour === 'green')?.promotedSectionId).toBeNull();
});
