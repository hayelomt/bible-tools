import { expect, type Page, test } from '@playwright/test';
import { rows } from './helpers.ts';

// Highlights (F8, M5-02): select verses, colour them, add a note, edit and delete, and find the
// highlight in the verse index. Promotion into a lesson is M5-03.

const verse = (page: Page, n: number) => page.locator(`[data-verse="${n}"]`);
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected verses' });

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('highlights verses, notes them, and lists them in the verse index', async ({ page }) => {
    await page.goto('/read/JHN.10');
    await expect(verse(page, 11)).toContainText('I am the good shepherd');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    await verse(page, 11).click();
    await verse(page, 12).click();
    await expect(bar(page)).toBeVisible();
    await expect(bar(page)).toContainText('John 10:11–12 selected');
    // The bar takes the bottom navigation's place.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await bar(page).getByRole('button', { name: 'Yellow' }).click();
    await expect(verse(page, 11)).toContainText('Highlighted yellow');
    await expect(verse(page, 12)).toContainText('Highlighted yellow');
    await expect(verse(page, 10)).not.toContainText('Highlighted');
    await expect(bar(page).getByRole('button', { name: 'Yellow' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await bar(page).getByRole('button', { name: 'Note' }).click();
    const note = page.getByRole('textbox', { name: 'Note on John 10:11–12' });
    await note.fill('The shepherd');
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(note).toBeHidden();
    await expect(verse(page, 11)).toContainText('Note: The shepherd');

    await expect.poll(async () => (await rows(page, 'citation')).length).toBe(1);
    const stored = await rows<{ colour: string; note: string; ref: { display: string } }>(
      page,
      'highlight',
    );
    expect(stored).toEqual([
      expect.objectContaining({
        colour: 'yellow',
        note: 'The shepherd',
        ref: expect.objectContaining({ display: 'John 10:11–12' }),
      }),
    ]);

    await page.goto('/verses/JHN.10');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('John 10');
    await expect(page.getByText('1 highlight', { exact: true })).toBeVisible();
    const entry = page.getByRole('link', { name: /Highlight/ });
    await expect(entry).toContainText('John 10:11–12');
    await expect(entry).toContainText('The shepherd');
    await expect(entry).toContainText('yellow');

    await page.getByRole('radio', { name: 'Notes' }).click();
    await expect(page.getByText('No notes on John 10.')).toBeVisible();
    await expect(entry).toBeHidden();
    await page.getByRole('radio', { name: 'Highlights' }).click();
    await expect(entry).toBeVisible();
    await page.getByRole('radio', { name: 'All' }).click();
    await expect(entry).toBeVisible();

    // Back at the same verses: another colour edits the highlight, and Remove undoes.
    await entry.click();
    await expect(page).toHaveURL(/\/read\/JHN\.10$/);
    await verse(page, 11).click();
    await verse(page, 12).click();
    await bar(page).getByRole('button', { name: 'Green' }).click();
    await expect(verse(page, 11)).toContainText('Highlighted green');
    await bar(page).getByRole('button', { name: 'Remove highlight' }).click();
    await expect(verse(page, 11)).not.toContainText('Highlighted');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(verse(page, 11)).toContainText('Highlighted green');

    await bar(page).getByRole('button', { name: 'Clear selection' }).click();
    await expect(bar(page)).toBeHidden();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the selection bar sits under the chapter and the sidebar stays', async ({ page }) => {
    await page.goto('/read/JHN.10');
    await verse(page, 11).click();
    await expect(bar(page)).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(bar(page)).toBeHidden();
  });
});
