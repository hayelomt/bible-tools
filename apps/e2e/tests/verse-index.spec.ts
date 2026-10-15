import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

const suggestions = (page: Page) => page.getByRole('listbox', { name: 'Verse suggestions' });

/** A lesson with one note ending in a verse chip, picked from the suggestions. */
async function lessonCiting(page: Page, title: string, note: string) {
  await page.goto('/');
  await newLesson(page, title);
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await page.keyboard.type(note);
  await expect(suggestions(page)).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(suggestions(page)).toBeHidden();
  await expect.poll(async () => (await rows(page, 'citation')).length).toBeGreaterThan(0);
}

test('the verse index lists every note citing a passage, from a chip and from search', async ({
  page,
}) => {
  await lessonCiting(page, 'Justified by faith', 'Who will deliver me? Rom 7:24-8:2');
  await lessonCiting(page, 'All things for good', 'God works all things for good, Rom 8:28');
  await expect.poll(async () => (await rows(page, 'citation')).length).toBe(2);

  // From the chip: every note on Romans 8:28, which the range ending at 8:2 doesn't reach.
  await page
    .getByRole('button', { name: 'Romans 8:28, Berean Standard Bible, verse. Show text.' })
    .click();
  await page.getByRole('link', { name: 'Every note on Romans 8:28' }).click();
  await expect(page).toHaveURL(/\/verses\/ROM\.8\.28$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Romans 8:28');
  await expect(page.getByText('1 note', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /All things for good/ })).toBeVisible();
  // The chip's viewer stayed behind on the lesson.
  await expect(page.getByRole('dialog')).toBeHidden();

  // From a verse search: Romans 8 includes the range that starts in chapter 7.
  await page.goto('/search?q=rom 8');
  await page.getByRole('link', { name: 'Verse index for Romans 8' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Romans 8');
  await expect(page.getByText('2 notes', { exact: true })).toBeVisible();
  const entry = page.getByRole('link', { name: /Justified by faith/ });
  await expect(entry).toContainText('Romans 7:24–8:2');
  await expect(page.getByRole('link', { name: /All things for good/ })).toContainText(
    'Romans 8:28',
  );

  // A row opens the lesson at the note.
  await entry.click();
  await expect(page.locator('[data-flash]')).toContainText('Who will deliver me?');

  // Nothing cites Romans 9; an address that isn't a passage says so.
  await page.goto('/verses/ROM.9');
  await expect(page.getByText('Nothing cites Romans 9 yet.')).toBeVisible();
  await page.goto('/verses/ROM.17');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Passage not found');
});
