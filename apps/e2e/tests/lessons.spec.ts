import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

const PHONE = { width: 360, height: 740 };
const LAPTOP = { width: 1280, height: 800 };

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function newSeries(page: Page, name: string) {
  await page.getByRole('button', { name: 'New series' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill(name);
  await page.getByRole('button', { name: 'Create series' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
}

test.describe('on a phone', () => {
  test.use({ viewport: PHONE });

  test('a first run leads to the first lesson, which needs only a title', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Your notes start here.')).toBeVisible();

    // Leaving a new lesson before it has a title leaves nothing behind.
    await page.getByRole('button', { name: 'New lesson' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText('Your notes start here.')).toBeVisible();
    expect(await rows(page, 'lesson')).toEqual([]);

    await newLesson(page, 'The Good Shepherd');
    await expect(page).not.toHaveURL(/new=/);
    await page.reload();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('The Good Shepherd');
    const [lesson] = await rows<{ source: string; seriesId: null; date: string }>(page, 'lesson');
    expect(lesson).toMatchObject({ source: 'sermon', seriesId: null });
    expect(lesson?.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /The Good Shepherd/ })).toBeVisible();
  });

  test('details save as they change, and main passages are stored normalised', async ({ page }) => {
    await page.goto('/');
    await newLesson(page, 'Abiding in the vine');
    await page.getByRole('button', { name: 'Details' }).click();

    await page.getByRole('radio', { name: 'Group' }).click();
    await page.getByRole('textbox', { name: 'Speaker' }).fill('Pastor Ann');
    const passages = page.getByRole('combobox', { name: 'Passages' });
    await passages.fill('jn 15:1-11');
    await expect(page.getByRole('option', { name: 'John 15:1–11' })).toBeVisible();
    await passages.press('Enter');
    await passages.fill('1 jn 3');
    await passages.press('Enter');
    await passages.fill('Xyz 3');
    await passages.press('Enter');
    await expect(passages).toHaveAttribute('aria-invalid', 'true');
    await expect(passages).toHaveValue('Xyz 3');

    const chips = page.getByRole('list', { name: 'Main passages' }).getByRole('listitem');
    await expect(chips).toHaveText(['John 15:1–11', '1 John 3']);
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.reload();

    const [lesson] = await rows<Record<string, unknown>>(page, 'lesson');
    expect(lesson).toMatchObject({
      source: 'group',
      speaker: 'Pastor Ann',
      mainPassages: [
        {
          book: 'JHN',
          chapter: 15,
          verseStart: 1,
          verseEnd: 11,
          display: 'John 15:1–11',
          translation: 'WEB',
        },
        { book: '1JN', chapter: 3, display: '1 John 3', translation: 'WEB' },
      ],
    });
    // The passages are in the verse index.
    expect(await rows(page, 'citation')).toHaveLength(2);

    await page.getByRole('button', { name: 'Details' }).click();
    await page.getByRole('button', { name: 'Remove 1 John 3' }).click();
    await expect(chips).toHaveText(['John 15:1–11']);
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByText(/John 15:1–11/)).toBeVisible();
    await expect(page.getByText(/1 John 3/)).toHaveCount(0);
    expect(await sidewaysScroll(page)).toBe(0);
  });

  test('a lesson moves between series, and out of one, and still shows on the home screen', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'Lazarus');
    await page.getByRole('link', { name: 'Back' }).click();
    // A lesson made from its series' page starts in it.
    await newSeries(page, 'John');
    await expect(page.getByText('No lessons in this series yet.')).toBeVisible();
    await page.getByRole('button', { name: 'New lesson in John' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('The Good Shepherd');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await newSeries(page, 'Acts');
    await page.getByRole('link', { name: 'Back' }).click();

    await page.getByRole('link', { name: /John · 1 lesson/ }).click();
    await expect(page.getByRole('link', { name: /The Good Shepherd/ })).toBeVisible();
    expect(await sidewaysScroll(page)).toBe(0);

    // Move it to Acts.
    await page.getByRole('link', { name: /The Good Shepherd/ }).click();
    await page.getByRole('button', { name: 'Lesson actions' }).click();
    await page.getByRole('menuitem', { name: 'Move to series…' }).click();
    await page.getByRole('radio', { name: 'Acts' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /John · 0 lessons/ })).toBeVisible();
    await page.getByRole('link', { name: /Acts · 1 lesson/ }).click();
    await expect(page.getByRole('link', { name: /The Good Shepherd/ })).toBeVisible();

    // And out of any series: it's still on the home screen.
    await page.getByRole('link', { name: /The Good Shepherd/ }).click();
    await page.getByRole('button', { name: 'Lesson actions' }).click();
    await page.getByRole('menuitem', { name: 'Move to series…' }).click();
    await page.getByRole('radio', { name: 'No series' }).click();
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('link', { name: /Acts · 0 lessons/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /The Good Shepherd/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /Lazarus/ })).toBeVisible();
  });

  test('a series can be renamed, and deleting it keeps its lessons', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New lesson' }).click();
    await page.getByRole('textbox', { name: 'Title' }).fill('Morning study');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Back' }).click();
    await newSeries(page, 'Psalms');
    await page.getByRole('link', { name: 'Back' }).click();
    await page.getByRole('link', { name: /Morning study/ }).click();
    await page.getByRole('button', { name: 'Details' }).click();
    await page.getByRole('combobox', { name: 'Series' }).selectOption({ label: 'Psalms' });
    await page.getByRole('link', { name: 'Back' }).click();

    await page.getByRole('link', { name: /Psalms · 1 lesson/ }).click();
    await page.getByRole('button', { name: 'Series actions' }).click();
    await page.getByRole('menuitem', { name: 'Edit series…' }).click();
    await page.getByRole('textbox', { name: 'Name' }).fill('Psalms of ascent');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Psalms of ascent');

    await page.getByRole('button', { name: 'Series actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete series…' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('Its 1 lesson stays, without a series.');
    await expect(confirm.getByRole('button', { name: 'Cancel' })).toBeFocused();
    await confirm.getByRole('button', { name: 'Delete series' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    await expect(page.getByRole('link', { name: /Psalms/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /Morning study/ })).toBeVisible();
  });

  test('deleting a lesson asks first', async ({ page }) => {
    await page.goto('/');
    await newLesson(page, 'To delete');
    await page.getByRole('button', { name: 'Lesson actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete lesson…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('To delete');

    const address = page.url();
    await page.getByRole('button', { name: 'Lesson actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete lesson…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete lesson' }).click();
    await expect(page.getByText('Your notes start here.')).toBeVisible();

    await page.goto(address);
    await expect(page.getByText(/This lesson doesn’t exist on this device/)).toBeVisible();
  });
});

test.describe('on a laptop', () => {
  test.use({ viewport: LAPTOP });

  test('"n" starts a new lesson, and the details are in the side panel', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    await page.keyboard.press('n');
    await expect(page.getByRole('textbox', { name: 'Title' })).toBeFocused();
    await page.keyboard.type('Morning study');
    await expect(page.getByText('Saved', { exact: true })).toBeVisible();

    const panel = page.getByRole('region', { name: 'Details' });
    await expect(panel.getByRole('textbox', { name: 'Church' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Details' })).toHaveCount(0);
    expect(await sidewaysScroll(page)).toBe(0);
  });

  test('"Show all" lists every lesson once there are more than five', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    for (const n of [1, 2, 3, 4, 5, 6]) {
      await page.keyboard.press('n');
      await page.getByRole('textbox', { name: 'Title' }).fill(`Lesson ${n}`);
      await expect(page.getByText('Saved', { exact: true })).toBeVisible();
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    }
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(5);
    await page.getByRole('link', { name: 'Show all 6 lessons' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('All lessons');
    await expect(page.getByRole('main').getByRole('listitem')).toHaveCount(6);
  });
});
