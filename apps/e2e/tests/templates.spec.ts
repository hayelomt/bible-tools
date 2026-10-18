import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Study-method templates (F25, M10-12): a new lesson's empty first section offers one; a section's
// menu adds one after it, with Undo; afterwards they're ordinary sections.

const headings = (page: Page) => page.locator('[data-section] h3');
const section = (page: Page, heading: string) =>
  page.locator('[data-section]').filter({ has: page.getByRole('heading', { name: heading }) });
const actions = async (page: Page, heading: string) => {
  await section(page, heading).getByRole('button', { name: 'Section actions' }).click();
};

test('a template makes its sections in order, which then edit, move and delete like any other', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'Psalm 23');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');

  // The empty first section offers a template until something is typed.
  await page.getByRole('button', { name: 'Start from a template' }).click();
  const picker = page.getByRole('dialog', { name: 'Start from a template' });
  await expect(picker.getByRole('list', { name: 'Built in' }).getByRole('listitem')).toHaveText([
    'SOAPScripture · Observation · Application · Prayer',
    'InductiveObserve · Interpret · Apply',
    'Lectio DivinaRead · Meditate · Pray · Contemplate',
    'Verse mappingThe verse · Key words · Cross-references · Paraphrase · Application',
  ]);
  await picker.getByRole('button', { name: /^SOAP/ }).click();
  await expect(headings(page)).toHaveText(['Scripture', 'Observation', 'Application', 'Prayer']);
  await expect(section(page, 'Scripture').getByRole('textbox')).toBeFocused();
  await page.keyboard.type('The Lord is my shepherd.');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'section')))
    .toContain('The Lord is my shepherd.');
  await expect(page.getByRole('button', { name: 'Start from a template' })).toBeHidden();

  // From a section's menu: after it, with Undo.
  await actions(page, 'Observation');
  await page.getByRole('menuitem', { name: 'Add a template…' }).click();
  await page
    .getByRole('dialog', { name: 'Add a template' })
    .getByRole('button', { name: /^Inductive/ })
    .click();
  await expect(headings(page)).toHaveText([
    'Scripture',
    'Observation',
    'Observe',
    'Interpret',
    'Apply',
    'Application',
    'Prayer',
  ]);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Added 3 Inductive sections.' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(headings(page)).toHaveText(['Scripture', 'Observation', 'Application', 'Prayer']);

  // Ordinary sections: moved and deleted from their menus.
  await actions(page, 'Prayer');
  await page.getByRole('menuitem', { name: 'Move up' }).click();
  await expect(headings(page)).toHaveText(['Scripture', 'Observation', 'Prayer', 'Application']);
  await actions(page, 'Observation');
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  await expect(headings(page)).toHaveText(['Scripture', 'Prayer', 'Application']);
  await expect(section(page, 'Scripture')).toContainText('The Lord is my shepherd.');
});
