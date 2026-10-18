import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Highlights (F8, M5-02): select verses, colour them, add a note, edit and delete, and find the
// highlight in the verse index; then add them to a lesson (M5-03).

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

test('adds verses to a new lesson and to an existing one', async ({ page }) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  // Plain verses with a note: stored as a yellow highlight, then added to a new lesson.
  await page.goto('/read/JHN.10');
  await verse(page, 14).click();
  await bar(page).getByRole('button', { name: 'Note' }).click();
  await page.getByRole('textbox', { name: 'Note on John 10:14' }).fill('Known by my own');
  await page.getByRole('button', { name: 'Done' }).click();
  await bar(page).getByRole('button', { name: 'Add to lesson' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add John 10:14 to a lesson' });
  // The most recent lesson is chosen to start with.
  await expect(dialog.getByRole('radio', { name: /The Good Shepherd/ })).toBeChecked();
  await dialog.getByRole('radio', { name: 'New lesson “John 10:14”' }).check();
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByText('Added to John 10:14.')).toBeVisible();
  await expect(bar(page)).toBeHidden();
  await expect(verse(page, 14)).toContainText('Highlighted yellow');

  await page.getByRole('button', { name: 'Open', exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/[\w-]+\?section=/);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('John 10:14');
  await expect(page.getByText('Personal', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Known by my own')).toBeVisible();

  // Already added: the bar opens that section instead.
  await page.goto('/read/JHN.10');
  await verse(page, 14).click();
  await expect(bar(page).getByRole('link', { name: 'Open in lesson' })).toBeVisible();
  await expect(bar(page).getByRole('button', { name: 'Add to lesson' })).toBeHidden();

  // A highlight into an existing lesson, at its end.
  await bar(page).getByRole('button', { name: 'Clear selection' }).click();
  await verse(page, 11).click();
  await bar(page).getByRole('button', { name: 'Blue' }).click();
  await bar(page).getByRole('button', { name: 'Add to lesson' }).click();
  await page.getByRole('radio', { name: /The Good Shepherd/ }).check();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('Added to The Good Shepherd.')).toBeVisible();

  const lessons = await rows<{ id: string; title: string; source: string }>(page, 'lesson');
  const shepherd = lessons.find((lesson) => lesson.title === 'The Good Shepherd')!;
  const sections = await rows<{ id: string; lessonId: string }>(page, 'section');
  const highlights = await rows<{ colour: string; promotedSectionId: string | null }>(
    page,
    'highlight',
  );
  expect(highlights.map((h) => h.colour).toSorted()).toEqual(['blue', 'yellow']);
  const blue = highlights.find((h) => h.colour === 'blue')!;
  expect(sections.find((section) => section.id === blue.promotedSectionId)?.lessonId).toBe(
    shepherd.id,
  );

  // Verses that notes cite carry a marker (M5-04): only 11 and 14, the sections' chips.
  const markers = page.getByRole('link', { name: /^Notes on / });
  await expect(markers).toHaveText(['', '']);
  await expect(markers.nth(0)).toHaveAccessibleName('Notes on John 10:11');
  await expect(markers.nth(1)).toHaveAccessibleName('Notes on John 10:14');

  // A marker opens the verse's index, and Read comes back to the verse.
  await markers.nth(1).click();
  await expect(page).toHaveURL(/\/verses\/JHN\.10\.14$/);
  await expect(page.getByText('1 note · main passage of 1 lesson · 1 highlight')).toBeVisible();
  await page.getByRole('link', { name: 'Read John 10:14', exact: true }).click();
  await expect(page).toHaveURL(/\/read\/JHN\.10$/);
  await expect
    .poll(() => verse(page, 14).evaluate((el) => el.getBoundingClientRect().top))
    .toBeLessThan(100);

  // The selected verses' index, from the bar, even with nothing on them.
  await verse(page, 3).click();
  await verse(page, 4).click();
  await bar(page).getByRole('button', { name: 'More for the selected verses' }).click();
  await page.getByRole('menuitem', { name: 'Verse index' }).click();
  await expect(page).toHaveURL(/\/verses\/JHN\.10\.3-4$/);
  await expect(page.getByText('Nothing cites John 10:3–4 yet.', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Read John 10:3–4', exact: true }).click();
  await expect(page).toHaveURL(/\/read\/JHN\.10$/);
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
