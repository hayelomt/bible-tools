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

/** Settings → Templates, from the Settings page. */
async function openTemplates(page: Page) {
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Templates ›' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Templates' })).toBeVisible();
}

const yours = (page: Page) =>
  page.getByRole('list', { name: 'Your templates' }).getByRole('listitem');

test('your own templates: made in Settings or from a lesson, and one a kind’s default', async ({
  page,
}) => {
  await openTemplates(page);
  await expect(page.getByText(/^No templates of your own yet\./)).toBeVisible();

  // From scratch: Enter adds a name, Tab nests it under the section above, Shift+Tab undoes that.
  await page.getByRole('link', { name: 'New' }).click();
  await page.getByRole('textbox', { name: 'Name' }).fill('Sermon notes');
  await page.getByRole('textbox', { name: 'Section 1' }).fill('Main point');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Points');
  await page.keyboard.press('Enter');
  await page.keyboard.type('One');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Two');
  await page.keyboard.press('Enter');
  await page.keyboard.type('Response');
  await page.keyboard.press('Shift+Tab');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(yours(page)).toHaveText(['Sermon notesMain point · Points ↳ 2 · Response']);

  // A built-in copied to change.
  await page.getByRole('button', { name: 'Copy SOAP to edit' }).click();
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveValue('SOAP (copy)');
  await page.getByRole('button', { name: 'Create template' }).click();
  await expect(yours(page)).toHaveText([/^Sermon notes/, /^SOAP \(copy\)/]);
  await expect.poll(async () => (await rows(page, 'template')).length).toBe(2);

  // A personal lesson starts with SOAP; a lesson made as a sermon swaps to it when its kind
  // changes, while nothing is written in it.
  await page.getByRole('combobox', { name: 'Personal' }).selectOption('SOAP');
  await page.goto('/');
  await newLesson(page, 'Psalm 23');
  await expect(headings(page)).toHaveCount(0);
  await page.getByRole('radio', { name: 'Personal' }).check();
  await expect(headings(page)).toHaveText(['Scripture', 'Observation', 'Application', 'Prayer']);

  // The picker lists the user's own after the built-ins.
  await actions(page, 'Prayer');
  await page.getByRole('menuitem', { name: 'Add a template…' }).click();
  const picker = page.getByRole('dialog', { name: 'Add a template' });
  await expect(picker.getByRole('list', { name: 'Yours' }).getByRole('listitem')).toHaveText([
    'Sermon notesMain point · Points ↳ 2 · Response',
    'SOAP (copy)Scripture · Observation · Application · Prayer',
  ]);
  await picker.getByRole('button', { name: /^Sermon notes/ }).click();
  await expect(headings(page)).toHaveText([
    'Scripture',
    'Observation',
    'Application',
    'Prayer',
    'Main point',
    'Points',
    'One',
    'Two',
    'Response',
  ]);

  // The lesson saved as a template keeps its headings.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Save as template…' }).click();
  const save = page.getByRole('dialog', { name: 'Save as template' });
  await expect(save.getByRole('textbox', { name: 'Name' })).toHaveValue('Psalm 23');
  await save.getByRole('button', { name: 'Save template' }).click();
  await expect(page.getByText('Saved “Psalm 23” as a template.')).toBeVisible();

  // Deleted at once, with Undo.
  await openTemplates(page);
  await expect(yours(page)).toHaveText([/^Psalm 23/, /^Sermon notes/, /^SOAP \(copy\)/]);
  await expect(yours(page).first()).toContainText(
    'Scripture · Observation · Application · Prayer · Main point · Points ↳ 2 · Response',
  );
  await yours(page).filter({ hasText: 'SOAP (copy)' }).getByRole('link').click();
  await page.getByRole('button', { name: 'Delete template' }).click();
  await expect(yours(page)).toHaveText([/^Psalm 23/, /^Sermon notes/]);
  await page
    .getByRole('listitem')
    .filter({ hasText: 'Template “SOAP (copy)” deleted.' })
    .getByRole('button', { name: 'Undo' })
    .click();
  await expect(yours(page)).toHaveText([/^Psalm 23/, /^Sermon notes/, /^SOAP \(copy\)/]);
});
