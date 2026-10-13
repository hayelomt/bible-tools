import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

const PHONE = { width: 360, height: 740 };

interface StoredSection {
  id: string;
  parentId: string | null;
  orderKey: string;
  body: { content: { content?: { text?: string; marks?: { type: string }[] }[] }[] };
}

/** The stored sections as "text" and "  text" for replies, in the order the lesson shows them. */
async function outline(page: Page): Promise<string[]> {
  const sections = await rows<StoredSection>(page, 'section');
  const text = (s: StoredSection) =>
    s.body.content.map((b) => (b.content ?? []).map((n) => n.text ?? '').join('')).join(' / ');
  const byKey = (a: StoredSection, b: StoredSection) => (a.orderKey < b.orderKey ? -1 : 1);
  return sections
    .filter((s) => s.parentId === null)
    .toSorted(byKey)
    .flatMap((s) => [
      text(s),
      ...sections
        .filter((r) => r.parentId === s.id)
        .toSorted(byKey)
        .map((r) => `  ${text(r)}`),
    ]);
}

const note = (page: Page, n = 0) => page.getByRole('textbox', { name: 'Note', exact: true }).nth(n);
const reply = (page: Page, n = 0) =>
  page.getByRole('textbox', { name: 'Reply', exact: true }).nth(n);

/** A new lesson with the cursor in its first section (Enter in the title). */
async function startLesson(page: Page) {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();
}

test('text typed and the tab closed at once is still there on reopen', async ({
  page,
  context,
}) => {
  await startLesson(page);
  await page.keyboard.type('Jesus is the door');
  const url = page.url();
  // Closing as a person does: the page gets `pagehide`, well inside the 500 ms debounce.
  await page.close({ runBeforeUnload: true });

  const reopened = await context.newPage();
  await reopened.goto(url);
  await expect(note(reopened)).toHaveText('Jesus is the door');
});

test('an empty section is a draft, stored once it has text', async ({ page }) => {
  await startLesson(page);
  await expect(note(page)).toHaveAttribute('data-level', '0');
  expect(await rows(page, 'section')).toEqual([]);
  await page.keyboard.type('A');
  await expect.poll(() => outline(page)).toEqual(['A']);
});

test('Enter, Tab and Shift+Tab shape the sections, two levels at most', async ({ page }) => {
  await startLesson(page);

  // Enter on an empty last line ends the section and starts the next.
  await page.keyboard.type('First');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(note(page, 1)).toBeFocused();
  await page.keyboard.type('Second');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');

  // Tab makes it a reply to the section above.
  await page.keyboard.press('Tab');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.type('Under second');
  await expect.poll(() => outline(page)).toEqual(['First', 'Second', '  Under second']);

  // Tab in a reply does nothing: there's no third level.
  await page.keyboard.press('Tab');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.type('!');

  // Nor in a section with replies: Arrow up goes to "Second", which can't become a reply.
  await page.keyboard.press('ArrowUp');
  await expect(note(page, 1)).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(note(page, 1)).toBeFocused();
  await expect.poll(() => outline(page)).toEqual(['First', 'Second', '  Under second!']);

  // Shift+Tab moves a reply back out; Enter in an empty reply does the same.
  await page.keyboard.press('ArrowDown');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(note(page, 2)).toBeFocused();
  await expect.poll(() => outline(page)).toEqual(['First', 'Second', 'Under second!']);
  await page.keyboard.press('Tab');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page
    .getByRole('toolbar', { name: 'Editing' })
    .getByRole('button', { name: 'Reply', exact: true })
    .click();
  await expect(reply(page, 1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(note(page, 2)).toBeFocused();

  // Backspace in an empty section removes it and goes to the end of the one above.
  await page.keyboard.press('Backspace');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  await expect(note(page)).toBeFocused();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(note(page)).toHaveText('Second');
  await expect.poll(() => outline(page)).toEqual(['Second', '  Under second!']);

  // It all comes back in the same shape.
  await page.reload();
  await expect(note(page)).toHaveText('Second');
  await expect(reply(page)).toHaveText('Under second!');
});

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('the toolbar formats text and adds a reply', async ({ page }) => {
    await startLesson(page);
    const toolbar = page.getByRole('toolbar', { name: 'Editing' });
    await expect(toolbar).toBeVisible();
    await expect(toolbar.getByRole('button', { name: 'Make a reply' })).toBeDisabled();

    await page.keyboard.type('Grace');
    await page.keyboard.press('ControlOrMeta+a');
    await toolbar.getByRole('button', { name: 'Bold' }).click();
    await expect(toolbar.getByRole('button', { name: 'Bold' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(note(page)).toBeFocused();

    await toolbar.getByRole('button', { name: 'Reply', exact: true }).click();
    await expect(reply(page)).toBeFocused();
    await page.keyboard.type('More grace');
    await toolbar.getByRole('button', { name: 'Move out' }).click();
    await expect(note(page, 1)).toBeFocused();
    await toolbar.getByRole('button', { name: 'Make a reply' }).click();
    await expect(reply(page)).toBeFocused();

    await expect.poll(() => outline(page)).toEqual(['Grace', '  More grace']);
    const [first] = (await rows<StoredSection>(page, 'section')).filter((s) => !s.parentId);
    expect(first?.body.content[0]?.content?.[0]?.marks).toEqual([{ type: 'bold' }]);

    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBe(0);

    // The toolbar goes when no section is being typed in.
    await page.getByRole('textbox', { name: 'Title' }).click();
    await expect(toolbar).toBeHidden();
  });
});
