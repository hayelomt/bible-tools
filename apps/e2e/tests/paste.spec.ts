import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Paste intelligence (F19): in a section (M9-08) and in the Inbox's add box (M9-09). A paste goes
// in as copied; a quiet prompt offers chips; nothing changes without a tap.

interface Chip {
  type: 'verse';
  attrs: { display: string; translation: string; versionLabel?: string; snapshotText?: string };
}
interface StoredSection {
  body: { content: { content?: (Chip | { type: 'text'; text: string })[] }[] };
}

/** The verse chips stored in the lesson's sections. */
async function chips(page: Page): Promise<Chip['attrs'][]> {
  const sections = await rows<StoredSection>(page, 'section');
  return sections.flatMap((s) =>
    s.body.content.flatMap((block) =>
      (block.content ?? []).flatMap((n) => (n.type === 'verse' ? [n.attrs] : [])),
    ),
  );
}

const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();
const prompt = (page: Page) => page.getByRole('region', { name: 'Verse chips' });

const GOOD_SHEPHERD = 'I am the good shepherd. The good shepherd lays down His life for the sheep.';

// Copies as each site gives them (as in bible-data's verse-match.test.ts).
const SITES: Array<[site: string, text: string, offer: string]> = [
  [
    'the YouVersion app (KJV, two verses)',
    'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. For whom he did foreknow, he also did predestinate to be conformed to the image of his Son, that he might be the firstborn among many brethren.\nRomans 8:28-29 KJV',
    'Romans 8:28–29 · KJV',
  ],
  [
    // The KJV isn't downloaded here, so its text can't be known without a reference.
    'Bible Hub (BSB, verse numbers and footnote letters, no reference)',
    '28And we know that God works all things together for the goodd of those who love Him,e who are called according to His purpose. 29For those God foreknew, He also predestined to be conformed to the image of His Son, so that He would be the firstborn among many brothers.',
    'This is Romans 8:28–29 (BSB).',
  ],
  [
    'a web page (BSB, quoted after its reference)',
    'As Paul writes in Romans 8:28, “And we know that God works all things together for the good of those who love Him, who are called according to His purpose.” That is our hope.',
    'Romans 8:28 · BSB',
  ],
];

async function paste(page: Page, text: string) {
  await page.evaluate((copied) => navigator.clipboard.writeText(copied), text);
  await page.keyboard.press('ControlOrMeta+V');
}

/** A new lesson with the cursor in its first note, and the verse matcher ready. */
async function startLesson(page: Page) {
  await page.goto('/');
  await newLesson(page, 'Pasted');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await expect(note(page)).toBeFocused();
  await page.waitForFunction(
    () => performance.getEntriesByName('lamp:verse-match-ready').length > 0,
  );
}

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('a pasted verse becomes a chip with one tap, and Undo brings the paste back', async ({
  page,
}) => {
  await startLesson(page);
  await page.keyboard.type('Jesus says: ');
  await paste(page, `“${GOOD_SHEPHERD}” John 10:11 BSB`);
  await expect(prompt(page)).toContainText('John 10:11 · BSB');
  // Nothing changed yet; typing still goes to the note.
  await expect(note(page)).toBeFocused();
  await expect(note(page)).toContainText(GOOD_SHEPHERD);

  await prompt(page).getByRole('button', { name: 'Make chip' }).click();
  await expect(prompt(page)).toBeHidden();
  await expect(note(page).locator('p')).toHaveText('Jesus says: John 10:11 · BSB');
  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({
        display: 'John 10:11',
        translation: 'BSB',
        snapshotText: GOOD_SHEPHERD,
      }),
    ]);

  await page.keyboard.press('ControlOrMeta+Z');
  await expect(note(page).locator('p')).toHaveText(`Jesus says: “${GOOD_SHEPHERD}” John 10:11 BSB`);
  await expect.poll(() => chips(page)).toEqual([]);
});

test('pastes from three sites get the right offer, and Escape keeps each as pasted', async ({
  page,
}) => {
  await startLesson(page);
  for (const [site, text, offer] of SITES) {
    await paste(page, text);
    await expect(prompt(page), site).toContainText(offer);
    await page.keyboard.press('Escape');
    await expect(prompt(page)).toBeHidden();
    // Still in the note, the paste exactly as copied.
    await expect(note(page)).toBeFocused();
    await expect(note(page).locator('p')).toHaveText(text.split('\n'));
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.press('Delete');
  }
  expect(await chips(page)).toEqual([]);
});

test('several references: Make 3 chips, or choose', async ({ page }) => {
  await startLesson(page);
  await paste(page, 'Sermon notes: Romans 8:28, 38–39; Psalm 23:1');
  await expect(prompt(page)).toContainText('3 references found');
  await prompt(page).getByRole('button', { name: 'Choose…' }).click();
  await prompt(page).getByRole('button', { name: 'Make chip for Psalm 23:1' }).click();
  await expect(note(page).locator('p')).toHaveText(
    'Sermon notes: Romans 8:28, 38–39; Psalm 23:1 · BSB',
  );
  // The others are still offered.
  await expect(prompt(page).getByRole('button', { name: /^Make chip for/ })).toHaveCount(2);

  // Typing on ends the offer.
  await page.keyboard.type(' amen');
  await expect(prompt(page)).toBeHidden();

  await paste(page, ' Romans 8:28, 31');
  await expect(prompt(page)).toContainText('2 references found');
  await prompt(page).getByRole('button', { name: 'Make 2 chips' }).click();
  await expect(note(page).locator('p')).toHaveText(
    'Sermon notes: Romans 8:28, 38–39; Psalm 23:1 · BSB amen Romans 8:28 · BSB, Romans 8:31 · BSB',
  );
});

test('text from another version is kept as pasted, labelled with the version', async ({ page }) => {
  const niv = 'For God so loved the world that he gave his one and only Son';
  await startLesson(page);
  await paste(page, `John 3:16 (NIV) ${niv}`);
  await expect(prompt(page)).toContainText('John 3:16 · NIV');
  await page.keyboard.press('Alt+Enter');
  await expect(note(page).locator('p')).toHaveText('John 3:16 · NIV');
  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({ translation: 'pasted', versionLabel: 'NIV', snapshotText: niv }),
    ]);
});

test('the Inbox add box: Make chip adds at once, Choose… opens the share screen', async ({
  page,
}) => {
  await page.goto('/inbox');
  await page.getByRole('textbox', { name: 'Add a verse or a note' }).focus();
  await paste(page, 'Psalm 23:1 for the funeral');
  await expect(prompt(page)).toContainText('Psalm 23:1 · BSB');
  await prompt(page).getByRole('button', { name: 'Make chip' }).click();
  await expect(
    page.locator('[data-sonner-toast]', { hasText: 'Added to your inbox.' }),
  ).toBeVisible();
  const added = page.getByRole('article', { name: 'Psalm 23:1' });
  await expect(added).toContainText('Pasted ·');
  await expect(added).toContainText('for the funeral');
  await expect(page.getByRole('textbox', { name: 'Add a verse or a note' })).toHaveValue('');

  await page.getByRole('textbox', { name: 'Add a verse or a note' }).focus();
  await paste(page, 'Romans 8:28; Psalm 23:4');
  await expect(prompt(page)).toContainText('2 references found');
  await prompt(page).getByRole('button', { name: 'Choose…' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('From the clipboard');
  await expect(page.getByRole('heading', { name: 'Found 2' })).toBeVisible();
});

test('with the setting off, pasting offers nothing in a section or the inbox', async ({ page }) => {
  await page.goto('/settings');
  const setting = page.getByRole('switch', { name: /Offer verse chips when pasting/ });
  await expect(setting).toBeChecked();
  await setting.click();
  await expect(setting).not.toBeChecked();

  await page.goto('/inbox');
  const box = page.getByRole('textbox', { name: 'Add a verse or a note' });
  await box.focus();
  await paste(page, 'Psalm 23:1 for the funeral');
  await expect(box).toHaveValue('Psalm 23:1 for the funeral');
  // The prompt would be up by now: references are found at once.
  await page.waitForTimeout(500);
  await expect(prompt(page)).toBeHidden();

  await startLesson(page);
  await paste(page, 'Romans 8:28 is the verse');
  await expect(note(page).locator('p')).toHaveText('Romans 8:28 is the verse');
  await page.waitForTimeout(500);
  await expect(prompt(page)).toBeHidden();
});
