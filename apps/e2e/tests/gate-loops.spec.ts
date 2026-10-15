import { readFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { rows } from './helpers.ts';

// The M6 gate (PRD Milestones E): questions and verses come back for review, and lessons export.
// On a phone with no connection, after the Bible downloaded: a lesson's question is answered from
// the review queue, the verse memorised from its chip is reviewed on the card, and the lesson is
// exported to Markdown and opened in the print view.
test.use({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } });

const tab = (page: Page, name: RegExp) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name });
const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });

test('a question is answered and a verse reviewed from the queue, then the lesson exports and prints', async ({
  page,
  context,
}) => {
  // Installed and the Bible downloaded, on an earlier visit.
  await page.addInitScript(() => {
    (window as unknown as { prints: number }).prints = 0;
    window.print = () => void (window as unknown as { prints: number }).prints++;
  });
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Bible' }).getByLabel('Downloaded')).toBeVisible({
    timeout: 30_000,
  });

  // No connection from here on. A lesson with a verse chip and a question.
  await context.setOffline(true);
  await tab(page, /^Lessons/).click();
  await page.getByRole('button', { name: 'New lesson' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'Note', exact: true }).first()).toBeFocused();
  await page.keyboard.type('Jesus is the door John 10:9');
  await expect(page.getByRole('option', { name: /^John 10:9/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('salvation and pasture.');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'section')))
    .toContain('salvation and pasture.');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole('button', { name: 'Add to lesson' }).click();
  await page.getByRole('menuitem', { name: 'Add question' }).click();
  const field = page.getByRole('textbox', { name: 'New question' });
  await field.fill('Who are the other sheep?');
  await field.press('Enter');
  await field.press('Escape');
  await expect.poll(async () => (await rows(page, 'question')).length).toBe(1);

  // The verse memorised from its chip.
  await page
    .getByRole('button', { name: 'John 10:9, Berean Standard Bible, verse. Show text.' })
    .click();
  await page.getByRole('dialog').getByRole('button', { name: 'Memorise' }).click();
  await expect(toast(page, 'John 10:9 added to memory verses.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();

  // Both come back in the review queue.
  await expect(tab(page, /^Review/)).toHaveAccessibleName('Review 2 waiting');
  await tab(page, /^Review/).click();
  await expect(page.getByRole('heading', { name: 'Open questions · 1' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Memory verses · 1 due' })).toBeVisible();

  // The question, answered in its lesson.
  await page.getByRole('link', { name: 'Answer “Who are the other sheep?”' }).click();
  const answer = page.locator('[data-section]').filter({ hasText: 'Who are the other sheep?' });
  await expect(answer.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Other flocks, one shepherd.');
  await expect
    .poll(async () => (await rows<{ status: string }>(page, 'question'))[0]?.status)
    .toBe('answered');
  await page.keyboard.press('Escape');
  const lessonPage = new URL(page.url()).pathname;

  // The verse, reviewed on the card.
  await tab(page, /^Review/).click();
  await expect(page.getByRole('heading', { name: /^Open questions/ })).toBeHidden();
  await page.getByRole('link', { name: 'Start' }).click();
  await expect(page.getByText('John 10:9 · BSB')).toBeVisible();
  await page.getByRole('button', { name: 'Show the verse' }).click();
  await expect(page.getByText('I am the gate.')).toBeVisible();
  await page.getByRole('button', { name: 'Good, due tomorrow' }).click();
  await expect(page.getByText('Done for today.')).toBeVisible();
  const [item] = await rows<{ interval: number; reviewCount: number }>(page, 'memoryItem');
  expect(item).toMatchObject({ interval: 1, reviewCount: 1 });
  await tab(page, /^Review/).click();
  await expect(page.getByText('All caught up.')).toBeVisible();
  await expect(tab(page, /^Review/)).toHaveAccessibleName('Review');

  // The lesson, exported to Markdown with the answer and the verse text.
  await page.goto(lessonPage);
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Export “The Good Shepherd”' });
  const downloading = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Markdown file (.md)' }).click();
  const markdown = await readFile((await (await downloading).path())!, 'utf8');
  expect(markdown).toMatch(/^# The Good Shepherd\n/);
  expect(markdown).toContain('> **John 10:9 (BSB)** I am the gate.');
  expect(markdown).toContain('## Who are the other sheep?\n\nOther flocks, one shepherd.');
  expect(markdown).toContain('## Questions\n\n- [x] Who are the other sheep?');

  // And opened in the print view, with the print dialog.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await dialog.getByRole('button', { name: 'Print or save as PDF' }).click();
  await expect(page).toHaveURL((url) => url.pathname === `${lessonPage}/print`);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { prints: number }).prints))
    .toBe(1);
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { level: 1 })).toHaveText('The Good Shepherd');
  await expect(main.locator('blockquote')).toContainText('John 10:9 (BSB) I am the gate.');
  await expect(
    main.getByRole('heading', { level: 2, name: 'Who are the other sheep?' }),
  ).toBeVisible();
  await expect(main.getByRole('listitem')).toHaveText('☑Answered: Who are the other sheep?');
});
