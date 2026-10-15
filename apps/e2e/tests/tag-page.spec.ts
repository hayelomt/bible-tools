import { expect, type Page, test } from '@playwright/test';
import { newLesson } from './helpers.ts';

/**
 * Tags the lesson's first section from its menu, and waits for the tag to show under it: the write
 * is still going for a moment, and leaving the page then would drop it.
 */
async function tagSection(page: Page, name: string, n = 0) {
  await page.getByRole('button', { name: 'Section actions' }).nth(n).click();
  await page.getByRole('menuitem', { name: 'Tags' }).click();
  const input = page.getByRole('combobox', { name: 'Section tags' });
  await input.fill(name);
  await input.press('Enter');
  await input.press('Escape');
  await expect(
    page
      .locator('[data-section]')
      .nth(n)
      .getByRole('link', { name: new RegExp(`^#${name}$`, 'i') }),
  ).toBeVisible();
}

/** A lesson with one section, typed after the title. */
async function lessonWithNote(page: Page, title: string, text: string) {
  await page.goto('/');
  await newLesson(page, title);
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('a tag page lists every section and lesson with the tag, grouped by lesson', async ({
    page,
  }) => {
    await lessonWithNote(page, 'Abiding in the vine', 'Apart from me you can do nothing.');
    await tagSection(page, 'grace');
    await lessonWithNote(page, 'The Good Shepherd', 'Jesus is the door.');
    await page.getByRole('button', { name: 'Details' }).click();
    const lessonTags = page.getByRole('combobox', { name: 'Tags' });
    await lessonTags.fill('grace');
    await lessonTags.press('Enter');

    // A tag on a note opens its page; the section shows straight after tagging.
    await tagSection(page, 'Grace');
    const sectionTag = page.locator('[data-section]').first().getByRole('link', { name: '#grace' });
    await sectionTag.click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('#grace');
    await expect(page.getByText('2 sections in 2 lessons')).toBeVisible();
    // Newest lesson first (both today: the later one).
    await expect(page.getByRole('heading', { level: 2 })).toHaveText([
      /^The Good Shepherd · /,
      /^Abiding in the vine · /,
    ]);
    await expect(page.getByRole('link', { name: 'The whole lesson is tagged.' })).toBeVisible();

    // A section opens its lesson, scrolled to it and highlighted for a moment.
    await page.getByRole('link', { name: 'Apart from me you can do nothing.' }).click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Abiding in the vine');
    await expect(page.locator('[data-flash]')).toContainText('Apart from me');
    await expect(page.locator('[data-flash]')).toHaveCount(0, { timeout: 5000 });
  });

  test('a tag is renamed everywhere, but not to a name another tag has, and deleted', async ({
    page,
  }) => {
    await lessonWithNote(page, 'The Good Shepherd', 'Jesus is the door.');
    await tagSection(page, 'covenant');
    await page.locator('[data-section]').first().getByRole('link', { name: '#covenant' }).click();

    await page.getByRole('button', { name: 'Tag actions' }).click();
    await page.getByRole('menuitem', { name: 'Rename tag…' }).click();
    const name = page.getByRole('textbox', { name: 'Name' });
    await name.fill('HOPE');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByText('There’s already a tag #hope.')).toBeVisible();
    await name.fill('Covenant love');
    await page.getByRole('button', { name: 'Rename' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('#Covenant love');

    await page.getByRole('link', { name: 'Jesus is the door.' }).click();
    await expect(
      page.locator('[data-section]').first().getByRole('link', { name: '#Covenant love' }),
    ).toBeVisible();
    await page
      .locator('[data-section]')
      .first()
      .getByRole('link', { name: '#Covenant love' })
      .click();

    await page.getByRole('button', { name: 'Tag actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete tag…' }).click();
    const confirm = page.getByRole('dialog');
    await expect(confirm).toContainText('It comes off 1 note; the notes stay.');
    await confirm.getByRole('button', { name: 'Delete tag' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    await page.getByRole('link', { name: /The Good Shepherd/ }).click();
    await expect(page.getByRole('textbox', { name: 'Note', exact: true }).first()).toHaveText(
      'Jesus is the door.',
    );
    await expect(page.locator('[data-section]').first().getByRole('link')).toHaveCount(0);
  });
});
