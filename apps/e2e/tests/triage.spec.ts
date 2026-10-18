import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows, writeRows } from './helpers.ts';

// Inbox triage (F27, M11-02 to M11-04): select items for one bulk action with one Undo; make a
// takeaway, a question or a lesson from items; snooze until a day; old items flagged.

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const item = (page: Page, name: string) => page.getByRole('article', { name });
const addBox = (page: Page) => page.getByRole('textbox', { name: 'Add a verse or a note' });
const bar = (page: Page) => page.getByRole('toolbar', { name: 'Selected items' });
const more = async (page: Page, name: string) =>
  item(page, name)
    .getByRole('button', { name: /^More for/ })
    .click();

interface Item {
  id: string;
  text: string | null;
  snoozedUntil: string | null;
  placedInSectionId: string | null;
}

async function add(page: Page, ...notes: string[]) {
  for (const note of notes) {
    await addBox(page).fill(note);
    await addBox(page).press('Enter');
    await expect(item(page, note)).toBeVisible();
  }
}

test.use({ viewport: { width: 390, height: 844 } });

test('selected items are tagged, sent, dismissed and made a lesson in one action each, with Undo', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await page.goto('/inbox');
  await add(page, 'one', 'two', 'three');

  // Select: tick boxes, and a bar in place of the bottom navigation.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();
  await expect(bar(page)).toContainText('0 selected');
  await item(page, 'one').click();
  await page.getByRole('checkbox', { name: 'Select two' }).click();
  await expect(bar(page)).toContainText('2 selected');

  // Tag: one tag on both; the selection stays.
  await bar(page).getByRole('button', { name: 'Tag' }).click();
  const tagging = page.getByRole('dialog', { name: 'Tag 2 items' });
  await tagging.getByRole('combobox').fill('hesed');
  await tagging.getByRole('combobox').press('Enter');
  await expect(toast(page, '#hesed added to 2 items.')).toBeVisible();
  await expect(item(page, 'one')).toContainText('#hesed');
  await expect(item(page, 'two')).toContainText('#hesed');
  await expect(item(page, 'three')).not.toContainText('#hesed');

  // Send to lesson: both, in the order received, one toast and one Undo.
  await bar(page).getByRole('button', { name: 'Send to lesson' }).click();
  const send = page.getByRole('dialog', { name: 'Send 2 items to a lesson' });
  await send.getByRole('button', { name: 'Send' }).click();
  await expect(toast(page, '2 items sent to The Good Shepherd.')).toBeVisible();
  await expect(bar(page)).toBeHidden();
  await expect(page.getByRole('article')).toHaveCount(1);
  // Their tags went into their sections.
  await expect.poll(async () => (await rows(page, 'sectionTag')).length).toBe(2);
  await toast(page, '2 items sent').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);
  await expect.poll(async () => (await rows(page, 'section')).length).toBe(0);
  await expect.poll(async () => (await rows(page, 'sectionTag')).length).toBe(0);

  // Select all, Dismiss: no question, one Undo.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await bar(page).getByRole('button', { name: 'Select all' }).click();
  await expect(bar(page)).toContainText('3 selected');
  await bar(page).getByRole('button', { name: 'Dismiss' }).click();
  await expect(toast(page, '3 items dismissed.')).toBeVisible();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();
  await toast(page, '3 items dismissed.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('article')).toHaveCount(3);

  // Make a lesson: titled from the first received, its items become its sections in order.
  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await item(page, 'three').click();
  await item(page, 'one').click();
  await bar(page).getByRole('button', { name: 'More for the selected items' }).click();
  await page.getByRole('menuitem', { name: 'Make a lesson…' }).click();
  const make = page.getByRole('dialog', { name: 'Make a lesson' });
  await expect(make).toContainText('2 items become 2 sections, in the order received.');
  await expect(make.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('one');
  await make.getByRole('textbox', { name: 'Title', exact: true }).fill('Numbers');
  await make.getByRole('button', { name: 'Make lesson' }).click();
  await expect(page).toHaveURL(/\/lessons\//);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Numbers');
  const notes = page.locator('[data-section]');
  await expect(notes.nth(0)).toContainText('one');
  await expect(notes.nth(1)).toContainText('three');
});

test('an item becomes a takeaway or a question on a lesson, keeping its chip', async ({ page }) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await page.goto('/inbox');
  await addBox(page).fill('jn 10:11');
  await addBox(page).press('Enter');
  await expect(item(page, 'John 10:11')).toBeVisible();
  await add(page, 'Who are the other sheep?');

  await more(page, 'John 10:11');
  await page.getByRole('menuitem', { name: 'Make a takeaway…' }).click();
  const takeaway = page.getByRole('dialog', { name: 'Make a takeaway' });
  await expect(takeaway.getByRole('textbox', { name: 'Takeaway' })).toHaveValue('John 10:11');
  await takeaway.getByRole('textbox', { name: 'Takeaway' }).fill('He lays down his life.');
  await expect(takeaway.getByRole('radio', { name: /The Good Shepherd/ })).toBeChecked();
  await takeaway.getByRole('button', { name: 'Add takeaway' }).click();
  await expect(toast(page, 'Takeaway added to The Good Shepherd.')).toBeVisible();
  await expect(item(page, 'John 10:11')).toBeHidden();

  await more(page, 'Who are the other sheep?');
  await page.getByRole('menuitem', { name: 'Make a question…' }).click();
  const question = page.getByRole('dialog', { name: 'Make a question' });
  await question.getByRole('button', { name: 'Add question' }).click();
  await expect(toast(page, 'Question added to The Good Shepherd.')).toBeVisible();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();

  // Both in the lesson, and the verse's chip in a section of its own.
  await page.goto('/');
  await page
    .getByRole('link', { name: /The Good Shepherd/ })
    .first()
    .click();
  await expect(page.getByText('He lays down his life.')).toBeVisible();
  await expect(page.getByText('Who are the other sheep?').first()).toBeVisible();
  await expect(
    page.locator('[data-section]').getByRole('button', { name: /John 10:11/ }),
  ).toBeVisible();
});

test('a snoozed item hides until its day, and old items say how old', async ({ page }) => {
  await page.goto('/inbox');
  await add(page, 'Look up "hesed"');

  await more(page, 'Look up "hesed"');
  await page.getByRole('menuitem', { name: 'Snooze' }).click();
  await page.getByRole('menuitem', { name: /^Tomorrow/ }).click();
  await expect(toast(page, 'Snoozed until')).toBeVisible();
  await expect(item(page, 'Look up "hesed"')).toBeHidden();
  const [snoozed] = await rows<Item>(page, 'inboxItem');
  expect(snoozed!.snoozedUntil).toMatch(/^\d{4}-\d\d-\d\d$/);

  await page.getByRole('link', { name: 'Snoozed · 1' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Snoozed');
  const sleeping = item(page, 'Look up "hesed"');
  await expect(sleeping).toContainText('Until');
  await sleeping.getByRole('button', { name: 'Wake now' }).click();
  await expect(page.getByText('Nothing snoozed.')).toBeVisible();
  await page.goto('/inbox');
  await expect(item(page, 'Look up "hesed"')).toBeVisible();

  // An item 39 days in the inbox is flagged in words.
  const created = new Date(Date.now() - 39 * 86_400_000).toISOString();
  await writeRows(page, {
    inboxItem: [
      {
        ...snoozed!,
        id: '0199f000-0000-7000-8000-000000000001',
        text: 'Psalm 23 for the funeral',
        snoozedUntil: null,
        createdAt: created,
        updatedAt: created,
        receivedAt: created,
        rev: 0,
      },
    ],
  });
  await page.reload();
  await expect(item(page, 'Psalm 23 for the funeral')).toContainText('39 days old');
  await expect(item(page, 'Look up "hesed"')).not.toContainText('days old');
});

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the whole inbox is processed from the keyboard, the current item in the side panel', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    await page.goto('/inbox');
    await add(page, 'one', 'two', 'three', 'four');
    // Typing in the add box isn't a key for the list.
    await expect(item(page, 'four')).toBeVisible();
    await addBox(page).blur();

    // `?` lists the keys.
    await page.keyboard.press('?');
    const keys = page.getByRole('dialog', { name: 'Inbox keys' });
    await expect(keys).toContainText('make a lesson from the selected items');
    await page.keyboard.press('Escape');
    await expect(keys).toBeHidden();

    // j moves the focus ring; the side panel shows the current item, every action with its key.
    await page.keyboard.press('j');
    await expect(item(page, 'four')).toBeFocused();
    await page.keyboard.press('j');
    await expect(item(page, 'three')).toBeFocused();
    const panel = page.getByRole('region', { name: 'Current item: three' });
    await expect(panel.getByRole('button', { name: /^Send to lesson/ })).toHaveAttribute(
      'aria-keyshortcuts',
      's',
    );
    await page.keyboard.press('k');
    await expect(item(page, 'four')).toBeFocused();

    // t tags it; d dismisses it, and the next item is current.
    await page.keyboard.press('t');
    const tags = page.getByRole('dialog', { name: 'Tags' });
    await tags.getByRole('combobox').fill('hesed');
    await tags.getByRole('combobox').press('Enter');
    await expect(tags.getByRole('list', { name: 'Tags' })).toContainText('#hesed');
    await tags.getByRole('button', { name: 'Done' }).press('Enter');
    await expect(tags).toBeHidden();
    await expect(item(page, 'four')).toContainText('#hesed');
    await expect(item(page, 'four')).toBeFocused();
    await page.keyboard.press('d');
    await expect(toast(page, 'Dismissed')).toBeVisible();
    await expect(item(page, 'three')).toBeFocused();

    // z snoozes it.
    await page.keyboard.press('z');
    const snooze = page.getByRole('dialog', { name: 'Snooze until' });
    await snooze.getByRole('button', { name: /^Tomorrow/ }).press('Enter');
    await expect(toast(page, 'Snoozed until')).toBeVisible();
    await expect(item(page, 'two')).toBeFocused();

    // x selects, Shift+x selects all, s sends the selected, in one action.
    await page.keyboard.press('x');
    await expect(bar(page)).toContainText('1 selected');
    await page.keyboard.press('Shift+X');
    await expect(bar(page)).toContainText('2 selected');
    await page.keyboard.press('s');
    const send = page.getByRole('dialog', { name: 'Send 2 items to a lesson' });
    await send.getByRole('button', { name: 'Send' }).press('Enter');
    await expect(toast(page, '2 items sent to The Good Shepherd.')).toBeVisible();
    await expect(page.getByText('Nothing waiting.')).toBeVisible();
  });
});
