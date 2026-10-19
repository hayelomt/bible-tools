import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The inbox (F17, M9-02): add a note and a verse, send one to a lesson, append one to a section,
// dismiss one, each with Undo, and the Inbox tab's badge counting what waits.

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const inboxTab = (page: Page) => nav(page).getByRole('link', { name: /^Inbox/ });
const item = (page: Page, name: string) => page.getByRole('article', { name });
const addBox = (page: Page) => page.getByRole('textbox', { name: 'Add a verse or a note' });

interface Item {
  id: string;
  origin: string;
  text: string | null;
  ref: { display: string; translation?: string; snapshotText?: string } | null;
  placedInSectionId: string | null;
}

test.use({ viewport: { width: 390, height: 844 } });

test('adds notes and verses, sends, appends and dismisses them, each with Undo', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  await inboxTab(page).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');
  await expect(page.getByText('Nothing waiting.')).toBeVisible();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox');

  // A note, and a reference that becomes a chip with the verse's text.
  await addBox(page).fill('Look up "hesed" before Sunday.');
  await addBox(page).press('Enter');
  await expect(item(page, 'Look up "hesed" before Sunday.')).toContainText('Added ·');
  await expect(addBox(page)).toHaveValue('');
  await addBox(page).fill('jn 10:11');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  const verse = item(page, 'John 10:11');
  await expect(verse).toContainText('John 10:11 · BSB');
  await expect(verse).toContainText('I am the good shepherd.');
  await addBox(page).fill('Psalm 23 for the funeral');
  await addBox(page).press('Enter');

  // Newest first, and the badge counts them.
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Psalm 23 for the funeral');
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox 3 waiting');
  const added = await rows<Item>(page, 'inboxItem');
  expect(added.find((row) => row.ref)).toMatchObject({
    origin: 'typed',
    text: null,
    ref: { book: 'JHN', chapter: 10, verseStart: 11, display: 'John 10:11' },
  });

  // Send to lesson: the most recent lesson is chosen; the item leaves the list.
  await verse.getByRole('button', { name: 'Send to lesson' }).click();
  const send = page.getByRole('dialog', { name: 'Add John 10:11 to a lesson' });
  await expect(send.getByRole('radio', { name: /The Good Shepherd/ })).toBeChecked();
  await send.getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Sent to The Good Shepherd.')).toBeVisible();
  await expect(verse).toBeHidden();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox 2 waiting');
  const sent = (await rows<Item>(page, 'inboxItem')).find((row) => row.ref)!;
  const sections = await rows<{ id: string }>(page, 'section');
  expect(sections.map((section) => section.id)).toContain(sent.placedInSectionId);

  // Undo puts it back and takes the section out.
  await toast(page, 'Sent to').getByRole('button', { name: 'Undo' }).click();
  await expect(verse).toBeVisible();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox 3 waiting');
  await expect.poll(async () => (await rows(page, 'section')).length).toBe(sections.length - 1);

  // Sent again, it's in the lesson as a section: the chip.
  await verse.getByRole('button', { name: 'Send to lesson' }).click();
  await send.getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Sent to The Good Shepherd.')).toBeVisible();

  // Append to a section: the lesson, then the section by its first line.
  const note = item(page, 'Look up "hesed" before Sunday.');
  await note.getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Append to a section…' }).click();
  const append = page.getByRole('dialog', { name: 'Append to a section' });
  await append.getByRole('button', { name: 'Next' }).click();
  await expect(append.getByRole('radio', { name: 'John 10:11' })).toBeChecked();
  await append.getByRole('button', { name: 'Append' }).click();
  await expect(toast(page, 'Added to The Good Shepherd.')).toBeVisible();
  await expect(note).toBeHidden();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox 1 waiting');

  // Dismiss happens at once, with Undo.
  const psalm = item(page, 'Psalm 23 for the funeral');
  await psalm.getByRole('button', { name: /^More for/ }).click();
  await page.getByRole('menuitem', { name: 'Dismiss' }).click();
  await expect(toast(page, 'Dismissed.')).toBeVisible();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox');
  await toast(page, 'Dismissed.').getByRole('button', { name: 'Undo' }).click();
  await expect(psalm).toBeVisible();
  await expect(inboxTab(page)).toHaveAccessibleName('Inbox 1 waiting');

  // The lesson holds the verse with the note after it.
  await nav(page).getByRole('link', { name: 'Lessons' }).click();
  await page
    .getByRole('link', { name: /The Good Shepherd/ })
    .first()
    .click();
  await expect(page.getByText('Look up "hesed" before Sunday.')).toBeVisible();
});
