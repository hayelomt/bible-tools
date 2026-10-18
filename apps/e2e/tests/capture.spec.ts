import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Capture mode (F26, M11-01): one tap from a lesson; plain text, each section with its time, a
// quick verse box, the passage pinned; Done shows the same sections in the lesson.

interface Section {
  id: string;
  body: { content: { content?: { type: string; text?: string }[] }[] };
  sourceAt: string | null;
}
interface Lesson {
  sourceStartedAt: string | null;
}

const capture = (page: Page) => page.getByRole('region', { name: 'Sections' });
const sections = (page: Page) => capture(page).getByRole('textbox', { name: 'Section' });
const verseBox = (page: Page) => page.getByRole('textbox', { name: 'Verse' });
const pad = (n: number) => String(n).padStart(2, '0');

test.use({ viewport: { width: 390, height: 844 } });

test('captures forty minutes of a sermon in plain sections with times, and Done shows them', async ({
  page,
}) => {
  await page.clock.install();
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  // The passage comes first, so capture pins it.
  await page.getByRole('button', { name: 'Details' }).click();
  const passages = page.getByRole('combobox', { name: 'Passages' });
  await passages.fill('John 10:1-18');
  await expect(page.getByRole('option', { name: 'John 10:1–18' })).toBeVisible();
  await passages.press('Enter');
  await expect(page.getByRole('list', { name: 'Main passages' })).toHaveText('John 10:1–18');
  await expect(page.getByText('Saved', { exact: true })).toBeVisible();

  await page.getByRole('link', { name: 'Capture' }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'John 10:1–18' })).toBeVisible();
  // The clock starts as capture opens on a lesson without a start.
  await expect
    .poll(async () => (await rows<Lesson>(page, 'lesson'))[0]?.sourceStartedAt)
    .toBeTruthy();
  await expect(page.getByText('00:00')).toBeVisible();

  // The first section is ready to type, with the hint in its place.
  await expect(sections(page)).toHaveCount(1);
  await expect(capture(page).locator('p[data-placeholder]')).toHaveAttribute(
    'data-placeholder',
    'Type what you hear. Each section gets the time it started.',
  );
  await page.clock.fastForward('02:10');
  await sections(page).first().click();
  await page.keyboard.type('The door is the only way in.');
  await expect(capture(page)).toContainText('02:10');

  // Enter on an empty line starts the next section.
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.clock.fastForward('07:35');
  await page.keyboard.type('Sheep know the voice before they see the shepherd. ');
  await expect(capture(page)).toContainText('09:45');

  // The quick verse box puts a chip at the cursor; an impossible reference says why.
  await verseBox(page).fill('rom 17 1');
  await verseBox(page).press('Enter');
  await expect(page.getByText('Romans has 16 chapters.')).toBeVisible();
  await verseBox(page).fill('jn 10 27');
  await verseBox(page).press('Enter');
  await expect(verseBox(page)).toHaveValue('');
  await expect(capture(page).getByRole('button', { name: /John 10:27/ })).toBeVisible();

  // New section, half an hour later.
  await page.clock.fastForward('30:00');
  await page.getByRole('button', { name: '+ New section' }).click();
  await page.keyboard.type('Hired hand runs; the shepherd stays.');
  await expect(page.getByRole('banner')).toContainText('39:45');
  await expect(capture(page)).toContainText('39:45');

  // Nothing is lost: three stored sections, each with its moment, in order.
  await expect.poll(async () => (await rows<Section>(page, 'section')).length).toBe(3);
  const stored = await rows<Section>(page, 'section');
  expect(stored.every((s) => s.sourceAt !== null)).toBe(true);
  expect(JSON.stringify(stored)).toContain('Hired hand runs; the shepherd stays.');

  // Done: the same sections, in the normal view, each with its time.
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page).toHaveURL(/\/lessons\/[^/]+$/);
  const notes = page.locator('[data-section]');
  await expect(notes.nth(0)).toContainText('02:10');
  await expect(notes.nth(0)).toContainText('The door is the only way in.');
  await expect(notes.nth(1)).toContainText('09:45');
  await expect(notes.nth(1).getByRole('button', { name: /John 10:27/ })).toBeVisible();
  await expect(notes.nth(2)).toContainText('39:45');

  // Set the start: every time moves with it.
  await page.getByRole('link', { name: 'Capture' }).click();
  await page.getByRole('button', { name: 'Capture actions' }).click();
  await page.getByRole('menuitem', { name: 'Set the start…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Set the start' });
  const start = new Date((await rows<Lesson>(page, 'lesson'))[0]!.sourceStartedAt!);
  start.setMinutes(start.getMinutes() + 2);
  await dialog
    .getByLabel('The recording starts at')
    .fill(`${pad(start.getHours())}:${pad(start.getMinutes())}:${pad(start.getSeconds())}`);
  await dialog.getByRole('button', { name: 'Set' }).click();
  // The start typed is whole seconds, so a time can read a second later than the typing moved it.
  await expect(capture(page)).toContainText(/00:1[01]/);
  await expect(capture(page)).toContainText(/07:4[56]/);
});

test('a lesson’s formatted sections show read-only in capture mode, and stay as they are', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'Psalm 23');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.press('Control+b');
  await page.keyboard.type('Bold point');
  await expect.poll(async () => (await rows(page, 'section')).length).toBe(1);

  await page.getByRole('link', { name: 'Capture' }).click();
  await expect(capture(page)).toContainText('Bold point');
  // Only the new section at the end is editable.
  await expect(sections(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.locator('[data-section] strong')).toHaveText('Bold point');
});
