import { expect, type Page, test } from '@playwright/test';

// The reader (F8, M5-01): a chapter of the BSB, the book and chapter picker, the chapter before and
// after, and the place it was left. Opening any chapter offline is in offline.spec.ts.

const title = (page: Page) => page.getByRole('heading', { level: 1 });
const verse = (page: Page, n: number) => page.locator(`[data-verse="${n}"]`);

/** Where a verse starts, from the top of the window. */
const verseTop = (page: Page, n: number) =>
  verse(page, n).evaluate((el) => el.getBoundingClientRect().top);

test('opens at John 1 and steps through chapters, across books', async ({ page }) => {
  await page.goto('/read');
  await expect(page).toHaveURL(/\/read\/JHN\.1$/);
  await expect(title(page)).toHaveText('John 1');
  await expect(verse(page, 1)).toHaveText(
    '1In the beginning was the Word, and the Word was with God, and the Word was God.',
  );
  await expect(page.getByTitle('Berean Standard Bible')).toHaveText('BSB');

  await page.getByRole('link', { name: 'Next chapter: John 2' }).click();
  await expect(title(page)).toHaveText('John 2');
  await page
    .getByRole('navigation', { name: 'Chapters' })
    .getByRole('link', { name: 'John 1' })
    .click();
  await expect(title(page)).toHaveText('John 1');

  // `←` and `→`, from the last chapter of the Old Testament into the first of the New.
  await page.goto('/read/MAL.4');
  await expect(title(page)).toHaveText('Malachi 4');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/\/read\/MAT\.1$/);
  await expect(title(page)).toHaveText('Matthew 1');
  await page.keyboard.press('ArrowLeft');
  await expect(title(page)).toHaveText('Malachi 4');

  // Nothing before Genesis 1 or after Revelation 22.
  await page.goto('/read/GEN.1');
  await expect(page.getByRole('button', { name: 'Previous chapter' })).toBeDisabled();
  await page.keyboard.press('ArrowLeft');
  await expect(title(page)).toHaveText('Genesis 1');
  await page.goto('/read/REV.22');
  await expect(page.getByRole('button', { name: 'Next chapter' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Revelation 21', exact: true })).toBeVisible();

  await page.goto('/read/XYZ.1');
  await expect(title(page)).toHaveText('Passage not found');
});

test('the picker opens a book and chapter; a book of one chapter opens at once', async ({
  page,
}) => {
  await page.goto('/read');
  await page.getByRole('button', { name: 'John 1' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose a passage' });
  await expect(picker.getByRole('button', { name: 'John', exact: true })).toHaveAttribute(
    'aria-current',
    'true',
  );

  // Esc closes it, back to the chapter.
  const filter = picker.getByRole('searchbox', { name: 'Filter books' });
  await expect(filter).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(picker).toBeHidden();
  await expect(page.getByRole('button', { name: 'John 1' })).toBeFocused();

  // The filter narrows the books; Enter takes the first.
  await page.getByRole('button', { name: 'John 1' }).click();
  await filter.fill('1 jo');
  await expect(picker.getByRole('button')).toHaveText(['1 John', 'Close']);
  await page.keyboard.press('Enter');
  const chapters = page.getByRole('dialog', { name: '1 John' });
  await expect(chapters.getByRole('heading', { name: '1 John' })).toBeFocused();
  await chapters.getByRole('link', { name: '4', exact: true }).click();
  await expect(chapters).toBeHidden();
  await expect(page).toHaveURL(/\/read\/1JN\.4$/);
  await expect(verse(page, 8)).toContainText('God is love.');

  // Back from a book's chapters to all the books, then a book of one chapter.
  await page.getByRole('button', { name: '1 John 4' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Psalms' }).click();
  await page.getByRole('button', { name: 'All books' }).click();
  await page
    .getByRole('dialog', { name: 'Choose a passage' })
    .getByRole('button', { name: 'Obadiah' })
    .click();
  await expect(page).toHaveURL(/\/read\/OBA\.1$/);
  await expect(title(page)).toHaveText('Obadiah');
  await expect(verse(page, 1)).toContainText('This is the vision of Obadiah');

  // A Psalm's title is part of its first verse in the BSB.
  await page.goto('/read/PSA.23');
  await expect(verse(page, 1)).toContainText('A Psalm of David. The LORD is my shepherd');
});

test('reopens where it was left, after a reload and from the navigation', async ({ page }) => {
  // A verse in the address opens the chapter there.
  await page.goto('/read/JHN.6.20');
  await expect(page).toHaveURL(/\/read\/JHN\.6$/);
  await expect.poll(() => verseTop(page, 20)).toBeLessThan(100);

  // Scrolled on (John 6 is long enough to scroll verse 30 to the top), the place is kept as the page scrolls.
  await verse(page, 30).evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 8));
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('lamp.readingPosition')))
    .toBe(JSON.stringify({ book: 'JHN', chapter: 6, verse: 30 }));

  await page.reload();
  await expect(title(page)).toHaveText('John 6');
  await expect.poll(() => verseTop(page, 30)).toBeLessThan(100);
  expect(await verseTop(page, 30)).toBeGreaterThanOrEqual(0);

  await page.getByRole('link', { name: 'Lessons', exact: true }).first().click();
  await page.getByRole('link', { name: 'Read', exact: true }).first().click();
  await expect(page).toHaveURL(/\/read\/JHN\.6$/);
  await expect.poll(() => verseTop(page, 30)).toBeLessThan(100);

  // Another chapter opens at its top, and becomes the place.
  await page.keyboard.press('ArrowRight');
  await expect(title(page)).toHaveText('John 7');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.goto('/read');
  await expect(page).toHaveURL(/\/read\/JHN\.7$/);
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true, isMobile: true });

  test('a swipe turns the chapter', async ({ page }) => {
    await page.goto('/read/JHN.10');
    await expect(verse(page, 1)).toBeVisible();
    const swipe = (dx: number) =>
      verse(page, 1).evaluate((el, distance) => {
        const at = (x: number) => [
          new Touch({ identifier: 1, target: el, clientX: x, clientY: 300 }),
        ];
        el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: at(200) }));
        el.dispatchEvent(
          new TouchEvent('touchend', {
            bubbles: true,
            touches: [],
            changedTouches: at(200 + distance),
          }),
        );
      }, dx);

    await swipe(-120);
    await expect(title(page)).toHaveText('John 11');
    await swipe(120);
    await expect(title(page)).toHaveText('John 10');
    // A short drag is scrolling, not a swipe.
    await swipe(-30);
    await expect(title(page)).toHaveText('John 10');
  });
});
