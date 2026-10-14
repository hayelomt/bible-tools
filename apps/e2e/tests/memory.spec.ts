import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Memory verses (F10, M6-01): "Memorise" from the reader's selection and from a verse chip, with
// Undo, and the verse index's Memory rows.

const verse = (page: Page, n: number) => page.locator(`[data-verse="${n}"]`);
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected verses' });
const more = (page: Page) =>
  bar(page).getByRole('button', { name: 'More for the selected verses' });
const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });

test.use({ viewport: { width: 390, height: 844 } });

test('memorises verses from the reader, lists them in the verse index, and removes them', async ({
  page,
}) => {
  await page.goto('/read/JHN.10');
  await verse(page, 27).click();
  await more(page).click();
  await page.getByRole('menuitem', { name: 'Memorise' }).click();
  await expect(toast(page, 'John 10:27 added to memory verses.')).toBeVisible();
  await expect.poll(async () => (await rows(page, 'memoryItem')).length).toBe(1);

  // Undo takes it out again.
  await toast(page, 'John 10:27 added').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await rows(page, 'memoryItem')).length).toBe(0);

  await more(page).click();
  await page.getByRole('menuitem', { name: 'Memorise' }).click();
  await expect.poll(async () => (await rows(page, 'memoryItem')).length).toBe(1);
  const [item] = await rows<Record<string, unknown>>(page, 'memoryItem');
  expect(item).toMatchObject({
    ref: expect.objectContaining({
      display: 'John 10:27',
      snapshotText: expect.stringContaining('My sheep hear my voice'),
    }),
    ease: 2.5,
    interval: 0,
    reviewCount: 0,
  });

  // Once added, the menu says so and opens the verse index's Memory rows.
  await more(page).click();
  await page.getByRole('menuitem', { name: 'In memory verses' }).click();
  await expect(page).toHaveURL(/\/verses\/JHN\.10\.27\?show=memory$/);
  await expect(page.getByText('1 memory verse', { exact: true })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Memory' })).toBeChecked();
  const row = page.getByRole('link', { name: /Memory · due today · new/ });
  await expect(row).toContainText('John 10:27 — My sheep hear my voice');

  // The chapter's index lists it too; the Highlights filter hides it.
  await page.goto('/verses/JHN.10');
  await expect(row).toBeVisible();
  await page.getByRole('radio', { name: 'Highlights' }).click();
  await expect(row).toBeHidden();
  await expect(page.getByText('No highlights on John 10.')).toBeVisible();
  await page.getByRole('radio', { name: 'All' }).click();

  // Removed from the row, with Undo.
  await page.getByRole('button', { name: 'Remove John 10:27 from memory verses' }).click();
  await expect(page.getByText('Nothing cites John 10 yet.', { exact: false })).toBeVisible();
  await toast(page, 'removed from memory verses').getByRole('button', { name: 'Undo' }).click();
  await expect(row).toBeVisible();

  // The row opens the reader at the verse.
  await row.click();
  await expect(page).toHaveURL(/\/read\/JHN\.10$/);
  await expect
    .poll(() => verse(page, 27).evaluate((el) => el.getBoundingClientRect().top))
    .toBeLessThan(150);
});

test('memorises a verse from its chip, and reads it in context', async ({ page }) => {
  await page.goto('/');
  await newLesson(page, 'Sheep and shepherd');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await page.keyboard.type('Ps 23:1');
  await page.keyboard.press('Enter');
  await page
    .getByRole('button', { name: 'Psalm 23:1, World English Bible, verse. Show text.' })
    .click();
  const viewer = page.getByRole('dialog');
  await viewer.getByRole('button', { name: 'Memorise' }).click();
  await expect(toast(page, 'Psalm 23:1 added to memory verses.')).toBeVisible();
  await expect(viewer.getByRole('link', { name: 'In memory verses' })).toBeVisible();
  const [item] = await rows<{ ref: Record<string, unknown> }>(page, 'memoryItem');
  // Stored without the editor's empty fields.
  expect(Object.values(item!.ref)).not.toContain(null);

  await viewer.getByRole('link', { name: 'Read in context' }).click();
  await expect(page).toHaveURL(/\/read\/PSA\.23$/);
  await expect(verse(page, 1)).toContainText('Yahweh is my shepherd');

  // From the reader, the same verse is in the list already.
  await verse(page, 1).click();
  await more(page).click();
  await expect(page.getByRole('menuitem', { name: 'In memory verses' })).toBeVisible();
});
