import { expect, type Page, test } from '@playwright/test';
import { newLesson } from './helpers.ts';

// Quick find (wireframes/reader.md "Quick find"): a word in the open chapter or lesson.

const bar = (page: Page) => page.getByRole('search');
const box = (page: Page) => bar(page).getByRole('searchbox', { name: 'Find' });
const count = (page: Page) => bar(page).getByRole('status');
const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();
/** How many words are marked, and the words of the current match. */
const painted = (page: Page) =>
  page.evaluate(() => {
    const ranges = (name: string) => [...(CSS.highlights.get(name)?.keys() ?? [])] as Range[];
    return {
      words: ranges('lamp-find').length,
      current: ranges('lamp-find-current').map((range) => range.toString()),
    };
  });

async function startLesson(page: Page) {
  await page.goto('/');
  await newLesson(page, 'Romans 8');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await expect(note(page)).toBeFocused();
}

test('Ctrl+F finds a word in the chapter and steps through its matches', async ({ page }) => {
  await page.goto('/read/PSA.23');
  await expect(page.locator('[data-verse="1"]')).toBeVisible();
  await page.keyboard.press('Control+f');
  await expect(box(page)).toBeFocused();

  await box(page).fill('lord');
  await expect(count(page)).toHaveText('1 of 2');
  await expect.poll(() => painted(page)).toEqual({ words: 2, current: ['LORD'] });
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('2 of 2');
  await page.keyboard.press('Enter');
  await expect(count(page)).toHaveText('1 of 2');
  await page.keyboard.press('Shift+Enter');
  await expect(count(page)).toHaveText('2 of 2');

  await box(page).fill('nothing like this');
  await expect(count(page)).toHaveText('No matches');
  await expect(bar(page).getByRole('button', { name: 'Next match' })).toBeDisabled();

  // Verse numbers aren't text to find.
  await box(page).fill('1');
  await expect(count(page)).toHaveText('No matches');

  await page.keyboard.press('Escape');
  await expect(bar(page)).toBeHidden();
  await expect.poll(() => painted(page)).toEqual({ words: 0, current: [] });
});

test('it closes with the chapter, and its marks go', async ({ page }) => {
  await page.goto('/read/PSA.23');
  await page.getByRole('button', { name: 'Find in chapter' }).click();
  await box(page).fill('lord');
  await expect(count(page)).toHaveText('1 of 2');
  await page
    .getByRole('link', { name: /^Psalm 24/ })
    .last()
    .click();
  await expect(page).toHaveURL(/PSA\.24/);
  await expect(bar(page)).toBeHidden();
  await expect.poll(() => painted(page)).toEqual({ words: 0, current: [] });
});

test('in a lesson it finds the title, notes and verse text, and leaves the note as it is', async ({
  page,
}) => {
  await startLesson(page);
  await page.keyboard.type('Grace in Rom 8:28');
  await page.keyboard.press('Enter');
  const preview = note(page).locator('[data-verse-preview]');
  await expect(preview).toHaveCount(1);
  const before = await note(page).evaluate((el) => el.innerHTML);

  await page.keyboard.press('Control+f');
  await box(page).fill('grace');
  await expect(count(page)).toHaveText('1 of 1');
  await expect.poll(() => painted(page)).toEqual({ words: 1, current: ['Grace'] });

  // A word in the verse text marks the verse: its words are drawn.
  await box(page).fill('purpose');
  await expect(count(page)).toHaveText('1 of 1');
  await expect(preview.locator('[data-find="current"]')).toHaveAttribute(
    'data-text',
    /His purpose/,
  );

  // The title is a field: it's marked whole.
  await box(page).fill('romans');
  await expect(count(page)).toHaveText(/^1 of /);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveAttribute(
    'data-find',
    'current',
  );

  await page.keyboard.press('Escape');
  await expect(note(page)).toBeFocused();
  await expect(preview.locator('[data-find]')).toHaveCount(0);
  await expect.poll(() => note(page).evaluate((el) => el.innerHTML)).toBe(before);
});

test('matches follow what is typed in the note while the bar is open', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('hope');
  await page.getByRole('button', { name: 'Find in lesson' }).click();
  await box(page).fill('hope');
  await expect(count(page)).toHaveText('1 of 1');
  await note(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' and hope');
  await expect(count(page)).toHaveText('1 of 2');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the icon opens the bar over the header', async ({ page }) => {
    await page.goto('/read/PSA.23');
    await page.getByRole('button', { name: 'Find in chapter' }).tap();
    await expect(box(page)).toBeFocused();
    await box(page).fill('shepherd');
    await expect(count(page)).toHaveText('1 of 1');
    await bar(page).getByRole('button', { name: 'Close find' }).tap();
    await expect(bar(page)).toBeHidden();
  });
});
