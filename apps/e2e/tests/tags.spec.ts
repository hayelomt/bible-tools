import { expect, type Locator, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

interface StoredTag {
  name: string;
  isSeeded: boolean;
}

const customTags = async (page: Page) =>
  (await rows<StoredTag>(page, 'tag')).filter((t) => !t.isSeeded).map((t) => t.name);

const list = (page: Page) => page.getByRole('listbox', { name: 'Tag suggestions' });
const note = (page: Page, n = 0) => page.getByRole('textbox', { name: 'Note', exact: true }).nth(n);

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('a lesson is tagged from its details: seeded tags, a new one on Enter, and Undo', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'The Good Shepherd');
    const panel = page.getByRole('region', { name: 'Details' });
    const input = panel.getByRole('combobox', { name: 'Tags' });

    // Seeded tags match as you type; the first is highlighted, and "Create" comes last.
    await input.fill('gr');
    await expect(list(page).getByRole('option')).toHaveText(['grace', 'Create “gr”']);
    await expect(list(page).getByRole('option', { name: 'grace' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await input.press('Enter');
    const chips = panel.getByRole('list', { name: 'Tags' }).getByRole('listitem');
    await expect(chips).toHaveText(['#grace']);
    await expect(input).toHaveValue('');
    await expect(input).toBeFocused();

    // A name no tag has is created on Enter.
    await input.fill('#Covenant');
    await expect(list(page).getByRole('option')).toHaveText(['Create “Covenant”']);
    await input.press('Enter');
    await expect(chips).toHaveText(['#grace', '#Covenant']);
    await expect.poll(() => customTags(page)).toEqual(['Covenant']);

    // Arrow keys and a click choose too; a tag already on the lesson isn't offered again.
    await input.fill('h');
    await expect(list(page).getByRole('option', { name: 'grace' })).toHaveCount(0);
    await list(page).getByRole('option', { name: 'Holy Spirit' }).click();
    await expect(chips).toHaveText(['#grace', '#Covenant', '#Holy Spirit']);
    await input.fill('GRACE');
    await expect(panel.getByText('Already tagged #grace.')).toBeVisible();
    await input.press('Enter');
    await expect(chips).toHaveCount(3);

    await page.reload();
    await expect(chips).toHaveText(['#grace', '#Covenant', '#Holy Spirit']);

    // Removed at once, with Undo.
    await panel.getByRole('button', { name: 'Remove #Covenant' }).click();
    await expect(chips).toHaveText(['#grace', '#Holy Spirit']);
    await expect(input).toBeFocused();
    // Undo puts it back where it was.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(chips).toHaveText(['#grace', '#Covenant', '#Holy Spirit']);
    // Backspace in the empty field takes off the last one.
    await input.press('Backspace');
    await expect(chips).toHaveText(['#grace', '#Covenant']);
    // The tag itself stays, for other notes.
    expect(await customTags(page)).toEqual(['Covenant']);
  });

  test('a section is tagged from its menu, and a custom tag shows in autocomplete', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'First');
    const details = page.getByRole('region', { name: 'Details' });
    await details.getByRole('combobox', { name: 'Tags' }).fill('Covenant');
    await details.getByRole('combobox', { name: 'Tags' }).press('Enter');
    await expect(details.getByRole('listitem')).toHaveText(['#Covenant']);

    await page.goto('/');
    await newLesson(page, 'Second');
    await page.getByRole('textbox', { name: 'Title' }).press('Enter');
    await page.keyboard.type('God keeps his promises');
    await page.keyboard.press('Escape');
    const handle = page.getByRole('button', { name: 'Section actions' });
    await handle.click();
    await page.getByRole('menuitem', { name: 'Tags' }).click();

    const input = page.getByRole('combobox', { name: 'Section tags' });
    await expect(input).toBeFocused();
    await page.keyboard.type('cov');
    await expect(list(page).getByRole('option')).toHaveText(['Covenant', 'Create “cov”']);
    // Typed in another case, it's the same tag.
    await page.keyboard.type('ENANT');
    await expect(list(page).getByRole('option')).toHaveText(['Covenant']);
    await page.keyboard.press('Enter');
    await page.keyboard.type('prom');
    await page.keyboard.press('Enter');

    // Escape closes the input, and focus goes back to the ⠿.
    await page.keyboard.press('Escape');
    await expect(input).toBeHidden();
    await expect(handle).toBeFocused();
    const shown = page.locator('[data-section]').first().getByRole('list', { name: 'Tags' });
    await expect(shown.getByRole('listitem')).toHaveText(['#Covenant', '#promises']);
    expect(await customTags(page)).toEqual(['Covenant']);
    await expect.poll(async () => (await rows(page, 'sectionTag')).length).toBe(2);

    await page.reload();
    await expect(shown.getByRole('listitem')).toHaveText(['#Covenant', '#promises']);

    // Clicking away closes it too.
    await handle.click();
    await page.getByRole('menuitem', { name: 'Tags' }).click();
    await expect(input).toBeFocused();
    await note(page).click();
    await expect(input).toBeHidden();
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the tag list fits the screen, and a tap adds', async ({ page }) => {
    await page.goto('/');
    await newLesson(page, 'Abiding in the vine');
    await page.getByRole('button', { name: 'Details' }).click();
    const input = page.getByRole('combobox', { name: 'Tags' });
    await input.fill('a long custom tag name that goes on and on and on');
    await input.press('Enter');
    await input.fill('s');
    await expect(list(page)).toBeVisible();
    const box = (await list(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(360);
    await list(page).getByRole('option', { name: 'salvation' }).tap();
    await expect(page.getByRole('list', { name: 'Tags' }).getByRole('listitem')).toHaveText([
      '#a long custom tag name that goes on and on and on',
      '#salvation',
    ]);
    const sideways = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(sideways).toBe(0);
  });

  test('a section’s tag typed straight away is added, and its list clears the bottom bar', async ({
    page,
  }) => {
    await page.goto('/');
    await newLesson(page, 'Abiding in the vine');
    await page.getByRole('button', { name: 'Details' }).click();
    await page.getByRole('textbox', { name: 'Title' }).press('Enter');
    await page.keyboard.type('Apart from me you can do nothing.');
    await note(page).blur();
    await page.getByRole('button', { name: 'Section actions' }).tap();
    await page.getByRole('menuitem', { name: 'Tags' }).tap();

    // Enter before the list has shown still adds it.
    await page.keyboard.type('hope');
    await page.keyboard.press('Enter');
    const section = page.locator('[data-section]').first();
    await expect(section.getByRole('listitem')).toHaveText(['#hope']);

    await page.keyboard.type('fa');
    await expect(list(page)).toBeVisible();
    const bar = (await page.getByRole('navigation', { name: 'Main' }).boundingBox())!;
    const clear = async (locator: Locator) => {
      const box = (await locator.boundingBox())!;
      return box.y + box.height <= bar.y;
    };
    await expect.poll(() => clear(page.getByRole('combobox', { name: 'Section tags' }))).toBe(true);
    await expect.poll(() => clear(list(page))).toBe(true);
  });
});
