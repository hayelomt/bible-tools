import { readFile } from 'node:fs/promises';
import { type Download, expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Markdown export (F11, M6-05): a lesson or a series, as a file or copied, offline.

test.use({ viewport: { width: 390, height: 844 } });

const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();

async function text(download: Download): Promise<string> {
  return readFile((await download.path())!, 'utf8');
}

/** A lesson with a verse chip and a takeaway, in the series being looked at if there is one. */
async function writeLesson(page: Page) {
  await page.getByRole('textbox', { name: 'Title' }).fill('The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();
  await page.keyboard.type('Jesus is the door John 10:9');
  await expect(page.getByRole('option', { name: /^John 10:9/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('salvation and pasture.');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'section')))
    .toContain('salvation and pasture.');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole('button', { name: 'Add to lesson' }).click();
  await page.getByRole('menuitem', { name: 'Add takeaway' }).click();
  await page.keyboard.type('He knows his sheep by name.');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await rows(page, 'takeaway')).length).toBe(1);
}

test('a lesson downloads as a Markdown file offline, and copies as Markdown', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'New lesson' }).click();
  await writeLesson(page);

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export “The Good Shepherd”' });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Markdown file (.md)' }).click();
  const download = await downloading;
  await expect(dialog).toBeHidden();
  expect(download.suggestedFilename()).toMatch(/^\d{4}-\d{2}-\d{2}-the-good-shepherd\.md$/);
  const markdown = await text(download);
  expect(markdown).toMatch(/^# The Good Shepherd\n\n\w+day \d+ \w+ \d{4} · Sermon\n\n/);
  expect(markdown).toContain('Jesus is the door John 10:9 (WEB) salvation and pasture.');
  expect(markdown).toContain('> **John 10:9 (WEB)** I am the door.');
  expect(markdown).toContain('## Takeaways\n\n- He knows his sheep by name.');
  expect(markdown).toMatch(/---\n\nScripture: World English Bible \(public domain\)\.\n$/);

  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await dialog.getByRole('button', { name: 'Copy as Markdown' }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Copied.' })).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);
});

test('a series downloads with its lessons', async ({ page }) => {
  // "New series" shows once there's a lesson.
  await page.goto('/');
  await newLesson(page, 'Not in the series');
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'New series' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('John');
  await page.getByRole('button', { name: 'Create series' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('John');
  const seriesPage = page.url();
  await page.getByRole('button', { name: 'New lesson in John' }).click();
  await writeLesson(page);
  await page.goto(seriesPage);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('John');

  await page.getByRole('button', { name: 'Series actions' }).click();
  await page.getByRole('menuitem', { name: 'Export series…' }).click();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Export “John”' })
    .getByRole('button', { name: 'Markdown file (.md)' })
    .click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('john.md');
  const markdown = await text(download);
  expect(markdown).toMatch(/^# John\n\n.+ · 1 lesson\n\n## The Good Shepherd\n/);
  expect(markdown).toContain('### Takeaways\n\n- He knows his sheep by name.');
});
