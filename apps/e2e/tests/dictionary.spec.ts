import { expect, type Page, test } from '@playwright/test';
import { newLesson } from './helpers.ts';

// The KJV dictionary: its button in the reader while the KJV is the translation, the chapter's old
// words and grammar notes, a search of the whole glossary, and the button in a lesson that cites
// KJV text.

const button = (page: Page) => page.getByRole('button', { name: 'KJV dictionary' });
const sheet = (page: Page) => page.getByRole('dialog', { name: 'KJV dictionary' });
/** An entry's headword in the sheet. */
const term = (page: Page, word: string) =>
  page.locator('dfn', { hasText: new RegExp(`^${word}$`) });
const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();

/** Settings' translation; it applies at once (the radio follows the stored setting). */
async function useTranslation(page: Page, translation: 'BSB' | 'KJV') {
  await page.goto('/settings');
  const radio = page.getByRole('radio', { name: translation });
  await radio.click();
  await expect(radio).toBeChecked();
}

test('the reader explains a chapter’s old words, and searches them all', async ({ page }) => {
  await page.goto('/read/2TH.2');
  await expect(page.locator('[data-verse="7"]')).toContainText('the one who now restrains');
  await expect(button(page)).toHaveCount(0);

  await useTranslation(page, 'KJV');
  await page.goto('/read/2TH.2');
  await expect(page.locator('[data-verse="7"]')).toContainText('now letteth will let');
  await button(page).click();

  const words = sheet(page).getByRole('region', { name: 'In this chapter' });
  const letEntry = words.getByRole('listitem').filter({ has: term(page, 'let') });
  await expect(letEntry).toContainText('to hinder, hold back');
  await expect(letEntry).toContainText('Verse 7');
  const grammar = sheet(page).getByRole('region', { name: 'Grammar' });
  await expect(grammar).toContainText('-eth endings');
  await expect(grammar).toContainText('thou, thee, ye');

  // Opened with a click, the search box has the cursor; a meaning finds its word.
  const search = sheet(page).getByRole('searchbox', { name: 'Search the dictionary' });
  await expect(search).toBeFocused();
  await search.fill('hinder');
  await expect(sheet(page).getByRole('list', { name: 'Results' })).toContainText('let');
  await search.fill('qqq');
  await expect(sheet(page)).toContainText('No words match “qqq”.');

  await page.keyboard.press('Escape');
  await expect(sheet(page)).toBeHidden();

  // Genesis 1:26's "let us" is the modern sense, so it isn't listed there.
  await page.goto('/read/GEN.1');
  await button(page).click();
  await expect(sheet(page).getByRole('region', { name: 'Grammar' })).toBeVisible();
  await expect(sheet(page).getByRole('region', { name: 'In this chapter' })).toBeVisible();
  await expect(sheet(page).locator(term(page, 'let'))).toHaveCount(0);
});

test('a lesson that cites KJV text has the dictionary, whatever the translation', async ({
  page,
}) => {
  // A BSB verse has nothing for it to explain.
  await page.goto('/');
  await newLesson(page, 'Hindered');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.type('Paul was hindered, Rom 1:13');
  await page.keyboard.press('Enter');
  await expect(note(page)).toContainText('Romans 1:13 · BSB');
  await expect(button(page)).toHaveCount(0);

  await useTranslation(page, 'KJV');
  await page.goto('/');
  await newLesson(page, 'Let hitherto');
  const lesson = page.url();
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.type('Paul was let, Rom 1:13');
  await page.keyboard.press('Enter');
  await expect(note(page)).toContainText('Romans 1:13 · KJV');
  await button(page).click();
  const letEntry = sheet(page)
    .getByRole('listitem')
    .filter({ has: term(page, 'let') });
  await expect(letEntry).toContainText('Romans 1:13');
  await page.keyboard.press('Escape');

  // The chip keeps its KJV text when the translation changes, so the button stays.
  await useTranslation(page, 'BSB');
  await page.goto(lesson);
  await expect(note(page)).toContainText('Romans 1:13 · KJV');
  await expect(button(page)).toBeVisible();
});
