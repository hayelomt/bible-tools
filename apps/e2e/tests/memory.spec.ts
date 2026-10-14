import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Memory verses (F10, M6-01, M6-02): "Memorise" from the reader's selection and from a verse chip,
// with Undo; the verse index's Memory rows; and the memory card, from the Review tab and a row.

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

  // The row opens the verse's memory card.
  await row.click();
  await expect(page).toHaveURL(/\/review\/memory\?item=/);
  await expect(page.getByText('John 10:27 · WEB')).toBeVisible();
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

const memoriseInReader = async (page: Page, n: number) => {
  await verse(page, n).click();
  await more(page).click();
  await page.getByRole('menuitem', { name: 'Memorise' }).click();
  await expect(page.getByRole('menu')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(bar(page)).toBeHidden();
};

test('reviews the verses due on the card; Again brings one back, grades set the next review', async ({
  page,
}) => {
  await page.goto('/review');
  await expect(page.getByText('All caught up.')).toBeVisible();

  await page.goto('/read/JHN.10');
  await memoriseInReader(page, 27);
  await memoriseInReader(page, 28);
  await expect.poll(async () => (await rows(page, 'memoryItem')).length).toBe(2);

  await page.getByRole('link', { name: 'Review 2 waiting' }).click();
  await expect(page.getByRole('heading', { name: 'Memory verses · 2 due' })).toBeVisible();
  await expect(page.getByText('John 10:27 · John 10:28')).toBeVisible();
  await page.getByRole('link', { name: 'Start' }).click();

  // Hidden until shown; four grades with when each brings it back.
  const header = page.locator('[data-slot="screen-header"]');
  await expect(header).toContainText('Memory verses');
  await expect(header).toContainText('1 of 2');
  await expect(page.getByText('John 10:27 · WEB')).toBeVisible();
  await expect(page.getByText('Say it from memory, then show the verse.')).toBeVisible();
  await expect(page.getByText('My sheep hear my voice')).toBeHidden();
  await expect(page.getByText('New · added')).toBeVisible();
  await page.getByRole('button', { name: 'Show the verse' }).click();
  await expect(page.getByText('My sheep hear my voice')).toBeVisible();
  const grades = page.getByRole('group', { name: 'How well did you know it?' }).getByRole('button');
  await expect(grades).toHaveText(['Againtoday', 'Hardtomorrow', 'Goodtomorrow', 'Easy4 days']);

  // Again: it comes round again at the end.
  await page.getByRole('button', { name: 'Again, due today' }).click();
  await expect(header).toContainText('2 of 3');
  await expect(page.getByText('John 10:28 · WEB')).toBeVisible();
  await page.getByRole('button', { name: 'Show the verse' }).click();
  await page.keyboard.press('3'); // Good
  await expect(header).toContainText('3 of 3');
  await expect(page.getByText('John 10:27 · WEB')).toBeVisible();
  await expect(page.getByText('1 review · learning since')).toBeVisible();
  await page.getByRole('button', { name: 'Show the verse' }).click();
  await page.getByRole('button', { name: 'Easy, due in 4 days' }).click();

  await expect(page.getByText('Done for today.')).toBeVisible();
  await expect(page.getByText('Next verse due tomorrow.')).toBeVisible();
  const items = await rows<{
    ref: { display: string };
    interval: number;
    reviewCount: number;
    nextReviewAt: string;
  }>(page, 'memoryItem');
  const byVerse = Object.fromEntries(items.map((i) => [i.ref.display, i]));
  expect(byVerse['John 10:27']).toMatchObject({ interval: 4, reviewCount: 2 });
  expect(byVerse['John 10:28']).toMatchObject({ interval: 1, reviewCount: 1 });

  // Progress shows in the verse index.
  await page.goto('/verses/JHN.10?show=memory');
  await expect(
    page.getByRole('link', { name: /Memory · due in 4 days · learning · 2 reviews/ }),
  ).toContainText('John 10:27');
  await expect(
    page.getByRole('link', { name: /Memory · due tomorrow · learning · 1 review/ }),
  ).toContainText('John 10:28');

  // Nothing due: the Review tab says when, and the card says so.
  await page.goto('/review');
  await expect(page.getByText('All caught up.')).toBeVisible();
  await expect(page.getByText('Next verse due tomorrow.')).toBeVisible();
  await page.goto('/review/memory');
  await expect(page.getByText('No verses due today.')).toBeVisible();
});
