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

test('the lesson ends with an empty section, stored once it has text', async ({ page }) => {
  await startLesson(page);
  await expect(note(page)).toHaveAttribute('data-level', '0');
  expect(await rows(page, 'section')).toEqual([]);
  await page.keyboard.type('A');
  await expect.poll(() => outline(page)).toEqual(['A']);

  // An empty section waits at the end, so there's always a place to type; it isn't stored.
  await expect(note(page, 1)).toHaveText('');
  await note(page, 1).click();
  await page.keyboard.type('B');
  await expect.poll(() => outline(page)).toEqual(['A', 'B']);
  await expect(note(page, 2)).toHaveText('');
  await expect(page.getByRole('button', { name: 'Section', exact: true })).toHaveCount(0);
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

/** Three sections, A, B and C, then out of the editor. */
async function threeSections(page: Page) {
  await startLesson(page);
  for (const text of ['A', 'B']) {
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
  }
  await page.keyboard.type('C');
  await expect.poll(() => outline(page)).toEqual(['A', 'B', 'C']);
  await page.keyboard.press('Escape');
}

const handle = (page: Page, n: number) =>
  page.getByRole('button', { name: /^(Section|Reply) actions$/ }).nth(n);

test('the section menu reorders and deletes, with Undo, and asks before taking replies', async ({
  page,
}) => {
  await threeSections(page);
  // Only stored sections have a handle; the empty one at the end has nothing to move.
  await expect(page.getByRole('button', { name: 'Section actions' })).toHaveCount(3);

  await handle(page, 2).click();
  await expect(page.getByRole('menuitem', { name: 'Move down' })).toBeDisabled();
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect.poll(() => outline(page)).toEqual(['A', 'C', 'B']);
  // Focus stays on the moved section's handle, so the keyboard can carry on.
  await expect(handle(page, 1)).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Make a reply' }).click();
  await expect.poll(() => outline(page)).toEqual(['A', '  C', 'B']);
  await expect(page.getByRole('button', { name: 'Reply actions' })).toBeFocused();

  // In the editor, Alt+Shift+Up and Down do the same as Move up and Move down.
  await note(page, 1).click();
  await page.keyboard.press('Alt+Shift+ArrowUp');
  await expect.poll(() => outline(page)).toEqual(['B', 'A', '  C']);
  await expect(note(page, 0)).toBeFocused();

  // One section goes at once, and Undo brings it back where it was.
  await handle(page, 0).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect.poll(() => outline(page)).toEqual(['A', '  C']);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => outline(page)).toEqual(['B', 'A', '  C']);
  await expect(note(page, 0)).toHaveText('B');

  // A section with replies asks first, and Cancel changes nothing.
  await handle(page, 1).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Delete this section and its reply?' });
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(await outline(page)).toEqual(['B', 'A', '  C']);
  await handle(page, 1).click();
  await page.getByRole('menuitem', { name: 'Delete…' }).click();
  await dialog.getByRole('button', { name: 'Delete all 2' }).click();
  await expect.poll(() => outline(page)).toEqual(['B']);

  await page.reload();
  await expect(note(page, 0)).toHaveText('B');
  await expect(page.getByRole('textbox', { name: /^(Note|Reply)$/ })).toHaveCount(2);
});

test('dragging a section moves it, and pulling it right makes it a reply', async ({ page }) => {
  await threeSections(page);
  const row = (n: number) => page.locator('[data-section]').nth(n);

  /**
   * Presses on the handle of row `from`, moves it `right` px sideways and down to `y`, and lets go.
   * The card that follows the pointer shows while it's held.
   */
  async function drag(from: number, to: { right: number; y: number }, cancel = false) {
    await row(from).hover();
    const box = (await handle(page, from).boundingBox())!;
    const x = box.x + box.width / 2;
    await page.mouse.move(x, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(x + to.right, to.y, { steps: 12 });
    await expect(page.locator('[data-section] .border-dashed')).toBeVisible();
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up();
  }

  // C, dropped above A.
  const a = (await row(0).boundingBox())!;
  await drag(2, { right: 0, y: a.y + 2 });
  await expect.poll(() => outline(page)).toEqual(['C', 'A', 'B']);

  // B, pulled right just below A, becomes A's reply.
  const b = (await row(2).boundingBox())!;
  await drag(2, { right: 40, y: b.y + 4 });
  await expect.poll(() => outline(page)).toEqual(['C', 'A', '  B']);

  // Escape cancels a drag.
  const c = (await row(0).boundingBox())!;
  await drag(0, { right: 0, y: c.y + 200 }, true);
  await page.waitForTimeout(100);
  expect(await outline(page)).toEqual(['C', 'A', '  B']);
  // A drag doesn't open the menu.
  await expect(page.getByRole('menu')).toBeHidden();

  await page.reload();
  await expect(note(page, 0)).toHaveText('C');
  await expect(reply(page)).toHaveText('B');
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
  test.describe('by touch', () => {
    test.use({ hasTouch: true });

    test('a finger held on the handle drags; a quick swipe scrolls instead', async ({ page }) => {
      await threeSections(page);
      const box = (await handle(page, 2).boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const top = (await page.locator('[data-section]').first().boundingBox())!;
      const cdp = await page.context().newCDPSession(page);
      const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
        cdp.send('Input.dispatchTouchEvent', {
          type,
          touchPoints: type === 'touchEnd' ? [] : [{ x, y }],
        });
      const from = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

      // Moving at once is a swipe: nothing is picked up.
      await touch('touchStart', from.x, from.y);
      for (let i = 1; i <= 5; i++) await touch('touchMove', from.x, from.y - i * 20);
      await touch('touchEnd', 0, 0);
      await page.waitForTimeout(100);
      expect(await outline(page)).toEqual(['A', 'B', 'C']);
      await expect(page.getByRole('menu')).toBeHidden();

      // Held first, it drags: C goes above A.
      const now = (await handle(page, 2).boundingBox())!;
      await touch('touchStart', now.x + now.width / 2, now.y + now.height / 2);
      await page.waitForTimeout(400);
      for (let i = 1; i <= 8; i++) {
        const y = now.y + now.height / 2 + ((top.y + 2 - now.y - now.height / 2) * i) / 8;
        await touch('touchMove', top.x + 20, y);
      }
      await touch('touchEnd', 0, 0);
      await expect.poll(() => outline(page)).toEqual(['C', 'A', 'B']);
      await expect(page.getByRole('menu')).toBeHidden();
      // The rows slide into their new places before the next tap.
      await expect(page.locator('[data-section][style*="translate"]')).toHaveCount(0);

      // A tap opens the menu; the Undo toast sits above the bottom bar.
      await handle(page, 0).tap();
      await page.getByRole('menuitem', { name: 'Delete' }).tap();
      await expect.poll(() => outline(page)).toEqual(['A', 'B']);
      const bar = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
      // Polled: the toast slides in.
      await expect
        .poll(async () => {
          const toast = (await page.locator('[data-sonner-toast]').boundingBox())!;
          return toast.y + toast.height;
        })
        .toBeLessThanOrEqual(bar.y);
    });
  });
});
