import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Links between notes (F23, M10-05 to M10-07): `[[` links a lesson or a section, the chip shows
// the target's title as it is now and opens it, "Linked from" lists what links here, and a
// deleted target leaves a visibly broken chip.

const note = (page: Page, n = 0) => page.getByRole('textbox', { name: 'Note', exact: true }).nth(n);
const picker = (page: Page) => page.getByRole('listbox', { name: 'Link to a lesson or section' });
const saved = (page: Page, text: string) =>
  expect.poll(async () => JSON.stringify(await rows(page, 'section'))).toContain(text);

/** A lesson with one note, from the lessons home; its address. */
async function lessonWith(page: Page, title: string, text: string): Promise<string> {
  await page.goto('/');
  await newLesson(page, title);
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();
  await page.keyboard.type(text);
  await saved(page, text);
  return new URL(page.url()).pathname;
}

test('a link made with [[ opens its target, follows a rename and breaks visibly on delete', async ({
  page,
}) => {
  const shepherd = await lessonWith(page, 'The Good Shepherd', 'I am the good shepherd.');
  await lessonWith(page, 'Lazarus', 'Same idea as ');

  // `[[` with nothing typed lists recent lessons; typing narrows to lessons and sections.
  await page.keyboard.type('[[');
  await expect(picker(page).getByRole('option').first()).toContainText('Lazarus');
  await page.keyboard.type('shep');
  await expect(picker(page).getByRole('group', { name: 'Lessons' })).toContainText(
    'The Good Shepherd',
  );
  await expect(picker(page).getByRole('group', { name: 'Sections' })).toContainText(
    '“I am the good shepherd.”',
  );
  await page.keyboard.press('Enter');
  await expect(picker(page)).toBeHidden();
  const toLesson = page.getByRole('link', { name: 'Link to lesson The Good Shepherd. Open.' });
  await expect(toLesson).toHaveText('The Good Shepherd');

  // A section, chosen with the arrow keys.
  await page.keyboard.type('and [[shepherd');
  await expect(picker(page).getByRole('group', { name: 'Sections' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const toSection = page.getByRole('link', {
    name: 'Link to section The Good Shepherd › “I am the good shepherd.”. Open.',
  });
  await expect(toSection).toBeVisible();
  await saved(page, 'noteLink');
  // Esc keeps what was typed.
  await page.keyboard.type(' [[door');
  await expect(picker(page)).toContainText('Nothing matches “door”.');
  await page.keyboard.press('Escape');
  await expect(picker(page)).toBeHidden();
  await expect(note(page)).toContainText('[[door');
  const lazarus = new URL(page.url()).pathname;

  // A tap opens the lesson, which lists what links to it, and its section.
  await toLesson.click();
  await expect(page).toHaveURL((url) => url.pathname === shepherd);
  const linkedFrom = page.getByRole('region', { name: 'Linked from · 1' });
  await expect(linkedFrom.getByRole('link')).toHaveText([/Lazarus ·.*“Same idea as/]);
  await page.getByRole('button', { name: 'Linked from 1' }).click();
  await expect(
    page.getByRole('region', { name: 'Linked from', exact: true }).getByRole('link'),
  ).toHaveText([/Lazarus/]);

  // A rename shows in the chip.
  await page.getByRole('textbox', { name: 'Title' }).fill('One Flock');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();
  await page.goto(lazarus);
  await expect(page.getByRole('link', { name: 'Link to lesson One Flock. Open.' })).toBeVisible();

  // From the keyboard: the arrow selects the chip, Enter opens the section, highlighted.
  await note(page).click();
  await page.keyboard.press('End');
  for (let i = 0; i < ' [[door'.length; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(
    (url) => url.pathname === shepherd && url.search.includes('section='),
  );
  await expect(page.locator('[data-flash]')).toContainText('I am the good shepherd.');

  // Deleted: the chip stays, struck through, with the title it had when it was made.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Delete lesson…' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete lesson' }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/');
  await page.goto(lazarus);
  const broken = page.getByRole('link', { name: 'Broken link, The Good Shepherd, deleted.' });
  await expect(broken).toContainText('The Good Shepherd · deleted');
  await broken.click();
  const dialog = page.getByRole('dialog', { name: 'Broken link' });
  await expect(dialog).toContainText('The Good Shepherd was deleted.');
  await dialog.getByRole('button', { name: 'Keep as text' }).click();
  await expect(broken).toBeHidden();
  await expect(note(page)).toContainText('Same idea as The Good Shepherd and');
});
