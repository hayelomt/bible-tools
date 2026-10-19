import { readFile } from 'node:fs/promises';
import { type Download, expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Export (F11): a lesson or a series as Markdown, a file or copied (M6-05), or printed and saved as
// a PDF from the print view (M6-06); all offline.

test.use({ viewport: { width: 390, height: 844 } });

const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();

/** Counts the print dialogs asked for, instead of opening them. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { prints: number }).prints = 0;
    window.print = () => void (window as unknown as { prints: number }).prints++;
  });
}

const prints = (page: Page) =>
  page.evaluate(() => (window as unknown as { prints: number }).prints);

async function text(download: Download): Promise<string> {
  return readFile((await download.path())!, 'utf8');
}

/** A lesson with a verse chip and a takeaway, in the series being looked at if there is one. */
async function writeLesson(page: Page) {
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
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
  expect(markdown).toContain('Jesus is the door John 10:9 (BSB) salvation and pasture.');
  expect(markdown).toContain('> **John 10:9 (BSB)** I am the gate.');
  expect(markdown).toContain('## Takeaways\n\n- He knows his sheep by name.');
  expect(markdown).toMatch(/---\n\nScripture: Berean Standard Bible \(public domain\)\.\n$/);

  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await dialog.getByRole('button', { name: 'Copy as Markdown' }).click();
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: 'Copied.' })).toBeVisible();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(markdown);

  // For Notion (M12-06): the verse text quoted with its reference under it, still offline.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await dialog.getByRole('button', { name: 'Copy for Notion' }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Copied for Notion.' }),
  ).toBeVisible();
  const notion = await page.evaluate(() => navigator.clipboard.readText());
  expect(notion).toMatch(/^# The Good Shepherd\n\n\w+day \d+ \w+ \d{4} · Sermon\n\n/);
  expect(notion).toContain('Jesus is the door John 10:9 (BSB) salvation and pasture.');
  expect(notion).toMatch(/\n\n> I am the gate\. .+\n\n— John 10:9 \(BSB\)\n\n/);
  expect(notion).toContain('## Takeaways\n\n- He knows his sheep by name.');
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

test.describe('with the service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a lesson opens in the print view offline, which asks to print once and prints only the page', async ({
    page,
    context,
  }) => {
    await stubPrint(page);
    // Installed: the print view's code comes from the service worker's copy when offline.
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole('button', { name: 'New lesson' }).click();
    await writeLesson(page);
    const lessonPage = new URL(page.url()).pathname;

    await context.setOffline(true);
    await page.getByRole('button', { name: 'Lesson actions' }).click();
    await page.getByRole('menuitem', { name: 'Export…' }).click();
    await page
      .getByRole('dialog', { name: 'Export “The Good Shepherd”' })
      .getByRole('button', { name: 'Print or save as PDF' })
      .click();

    // The print dialog opens once, and the address no longer asks for it.
    await expect(page).toHaveURL((url) => url.pathname === `${lessonPage}/print` && !url.search);
    await expect.poll(() => prints(page)).toBe(1);
    await expect(page).toHaveTitle('The Good Shepherd');
    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('The Good Shepherd');
    await expect(main).toContainText('Jesus is the door John 10:9 (BSB) salvation and pasture.');
    await expect(main.locator('blockquote')).toContainText('John 10:9 (BSB) I am the gate.');
    await expect(main.getByRole('heading', { name: 'Takeaways' })).toBeVisible();
    await expect(main).toContainText('Scripture: Berean Standard Bible (public domain).');

    // Printed, Back and Print are left out, and the page is white whatever the theme.
    await page.emulateMedia({ media: 'print', colorScheme: 'dark' });
    await expect(page.getByRole('link', { name: 'Back' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
    expect(await main.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(
      'rgb(255, 255, 255)',
    );
    await page.emulateMedia({ media: 'screen' });

    // Coming back to it doesn't ask again; Print does.
    await context.setOffline(false);
    await page.reload();
    await expect(main.getByRole('heading', { level: 1 })).toHaveText('The Good Shepherd');
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    expect(await prints(page)).toBe(0);
    await page.getByRole('button', { name: 'Print' }).click();
    expect(await prints(page)).toBe(1);

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page).toHaveURL((url) => url.pathname === lessonPage);
  });
});

test('a series prints a title page, then a page per lesson', async ({ page }) => {
  await stubPrint(page);
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

  await page.getByRole('button', { name: 'Series actions' }).click();
  await page.getByRole('menuitem', { name: 'Export series…' }).click();
  await page
    .getByRole('dialog', { name: 'Export “John”' })
    .getByRole('button', { name: 'Print or save as PDF' })
    .click();
  await expect(page).toHaveURL(`${seriesPage}/print`);
  await expect.poll(() => prints(page)).toBe(1);

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('John');
  await expect(main.getByRole('listitem').first()).toContainText('The Good Shepherd');
  const lesson = main.getByRole('heading', { level: 2, name: 'The Good Shepherd' });
  await expect(lesson).toBeVisible();
  await expect(main).not.toContainText('Not in the series');
  expect(
    await lesson.evaluate(
      (h) => getComputedStyle(h.closest('article')!.parentElement!).breakBefore,
    ),
  ).toBe('page');
});
