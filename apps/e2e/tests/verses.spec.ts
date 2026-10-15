import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

interface Chip {
  type: 'verse';
  attrs: { display: string; translation: string; snapshotText?: string };
}

interface StoredSection {
  body: { content: { content?: (Chip | { type: 'text'; text: string })[] }[] };
}

/** The verse chips stored in the lesson's sections, in order. */
async function chips(page: Page): Promise<Chip['attrs'][]> {
  const sections = await rows<StoredSection>(page, 'section');
  return sections.flatMap((s) =>
    s.body.content.flatMap((block) =>
      (block.content ?? []).flatMap((n) => (n.type === 'verse' ? [n.attrs] : [])),
    ),
  );
}

const note = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true }).first();
/** What was typed in the note, without the verse text shown under a paragraph. */
const paragraphs = (page: Page) => note(page).locator('p');
const list = (page: Page) => page.getByRole('listbox', { name: 'Verse suggestions' });
const option = (page: Page, name: string | RegExp) => list(page).getByRole('option', { name });

/**
 * Keeps a book from being fetched or downloaded, as if the connection went before it arrived.
 * Returns what lets it through again.
 */
async function withoutBook(page: Page, code: string): Promise<() => Promise<void>> {
  const url = `**/bible/BSB/${code}.*.json`;
  await page.route(url, (route) => route.abort('internetdisconnected'));
  return () => page.unroute(url);
}

async function startLesson(page: Page) {
  await page.goto('/');
  await newLesson(page, 'Romans 8');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();
}

test('references complete into chips with their text, offline too', async ({ page, context }) => {
  await withoutBook(page, '1JN');
  await startLesson(page);
  await page.keyboard.type('Paul says in Rom 8:28-30');
  await expect(option(page, /^Romans 8:28–30/)).toHaveAttribute('aria-selected', 'true');
  await expect(list(page)).toContainText(
    'And we know that God works all things together for the good',
  );
  await expect(note(page)).toHaveAttribute('aria-activedescendant', /.+/);
  await page.keyboard.press('Enter');
  await expect(list(page)).toBeHidden();
  await expect(paragraphs(page)).toHaveText('Paul says in Romans 8:28–30 · BSB ');
  await expect(note(page)).toBeFocused();

  // Typing goes on after the chip.
  await page.keyboard.type('and');
  await expect(paragraphs(page)).toHaveText('Paul says in Romans 8:28–30 · BSB and');

  // Offline, references still complete; a book fetched before has its text.
  await context.setOffline(true);
  for (const typed of [' romns 8', ' Rom 8:38–9:5']) {
    await page.keyboard.type(typed);
    await page.keyboard.press('Enter');
  }
  // A book not downloaded yet goes in without its text (M2-11 downloads them all).
  await page.keyboard.type(' 1 Jn 3');
  await expect(option(page, /^1 John 3/)).toContainText('Text not downloaded yet');
  await page.keyboard.press('Enter');

  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({
        display: 'Romans 8:28–30',
        translation: 'BSB',
        snapshotText: expect.stringMatching(
          /^And we know that God works all things together.*glorified\.$/,
        ),
      }),
      expect.objectContaining({
        display: 'Romans 8',
        snapshotText: expect.stringMatching(/^Therefore, there is now no condemnation/),
      }),
      expect.objectContaining({
        display: 'Romans 8:38–9:5',
        snapshotText: expect.stringMatching(/^For I am convinced.*Amen\.$/),
      }),
      { book: '1JN', chapter: 3, display: '1 John 3', translation: 'BSB' },
    ]);
});

test('Escape keeps the reference as typed', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('see Rom 8:28');
  await expect(list(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(list(page)).toBeHidden();
  await expect(note(page)).toBeFocused();
  await expect(note(page)).not.toHaveAttribute('aria-activedescendant');

  // It stays closed for that reference, and Enter is Enter again.
  await page.keyboard.type('-30');
  await expect(list(page)).toBeHidden();
  await page.keyboard.type(' is good');
  await expect(note(page)).toHaveText('see Rom 8:28-30 is good');
  expect(await chips(page)).toEqual([]);

  // A new reference opens it again.
  await page.keyboard.type(', as in Ps 23');
  await expect(option(page, /^Psalm 23/)).toBeVisible();
});

test('a short name lists every book it could be; arrows or a click choose', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('see jo 3');
  await expect(list(page).getByRole('option')).toHaveText([
    /^Joshua 3/,
    'Job 3',
    'Joel 3',
    'Jonah 3',
    'John 3',
  ]);
  await page.keyboard.press('ArrowDown');
  await expect(option(page, /^Job 3/)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  await page.keyboard.type('and jo 3');
  await option(page, /^John 3/).click();
  await expect(note(page)).toBeFocused();
  await expect(paragraphs(page)).toHaveText('see Job 3 · BSB and John 3 · BSB ');
});

test('a reference that can’t exist says why, and Enter stays Enter', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('Rom 17');
  await expect(list(page)).toHaveText('Romans has 16 chapters.');
  await expect(list(page).getByRole('option')).toHaveCount(0);
  await page.keyboard.press('Enter');
  await page.keyboard.type('next line');
  await expect(note(page).locator('p')).toHaveText(['Rom 17', 'next line']);
});

test('verses keep their KJV numbers, and a verse the BSB leaves out shows its note', async ({
  page,
}) => {
  await startLesson(page);
  await page.keyboard.type('Rom 16:25-27');
  await expect(option(page, /^Romans 16:25–27/)).toBeVisible();
  await expect(list(page)).toContainText('Now to Him who is able to strengthen you');
  await page.keyboard.press('Enter');

  await page.keyboard.type('and Acts 8:37');
  await expect(list(page)).toContainText(
    '[Not in BSB: Some later manuscripts include this verse.]',
  );
  await page.keyboard.press('Enter');
  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({ display: 'Romans 16:25–27' }),
      expect.objectContaining({
        display: 'Acts 8:37',
        snapshotText: '[Not in BSB: Some later manuscripts include this verse.]',
      }),
    ]);
});

const chip = (page: Page, name: string) =>
  page.getByRole('button', { name: `${name}, Berean Standard Bible, verse. Show text.` });
const viewer = (page: Page) => page.getByRole('dialog');

test('a chip opens the text it captured, which never changes', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('Rom 8:28');
  await page.keyboard.press('Enter');
  await chip(page, 'Romans 8:28').click();
  await expect(viewer(page)).toContainText('Romans 8:28');
  await expect(viewer(page)).toContainText('Berean Standard Bible');
  await expect(viewer(page)).toContainText(
    'And we know that God works all things together for the good',
  );
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toBeHidden();
  // The cursor is where it was.
  await expect(note(page)).toBeFocused();
  await page.keyboard.type('and more');
  await expect(paragraphs(page)).toHaveText('Romans 8:28 · BSB and more');
  await expect.poll(() => chips(page)).toHaveLength(1);

  // The BSB text changes (a corrected edition, say: a new file for the book in the manifest): the
  // chip keeps what it captured.
  await page.route('**/bible/manifest.json', async (route) => {
    const manifest = (await (await route.fetch()).json()) as {
      translations: { BSB: { books: { ROM: { file: string } } } };
    };
    const rom = manifest.translations.BSB.books.ROM;
    const original = `/bible/${rom.file}`;
    await page.route('**/bible/BSB/ROM.corrected.json', async (book) => {
      const text = (await (await page.request.get(original)).json()) as {
        c: string[][];
      };
      text.c[7]![27] = 'A corrected verse.';
      await book.fulfill({ json: text });
    });
    rom.file = 'BSB/ROM.corrected.json';
    await route.fulfill({ json: manifest });
  });
  await page.reload();
  await chip(page, 'Romans 8:28').click();
  await expect(viewer(page)).toContainText(
    'And we know that God works all things together for the good',
  );
  await page.keyboard.press('Escape');

  // The new text is what a new chip captures.
  await note(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Rom 8:28');
  await expect(list(page)).toContainText('A corrected verse.');
  await page.keyboard.press('Escape');
  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({
        display: 'Romans 8:28',
        snapshotText: expect.stringMatching(
          /^And we know that God works all things together for the good/,
        ),
      }),
    ]);
});

test('resting the mouse on a chip opens it; focus stays in the note', async ({ page }) => {
  await startLesson(page);
  await page.keyboard.type('Rom 8:28-29');
  await page.keyboard.press('Enter');
  await chip(page, 'Romans 8:28–29').hover();
  // Numbered: each verse after its number.
  await expect(viewer(page)).toContainText(
    '28And we know that God works all things together for the good',
  );
  await expect(viewer(page).locator('sup')).toHaveText(['28', '29']);
  await expect(note(page)).toBeFocused();
  // Into the popover and out of both: it closes, and typing goes on where it was.
  await viewer(page).hover();
  await expect(viewer(page)).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(viewer(page)).toBeHidden();
  await page.keyboard.type('and');
  await expect(paragraphs(page)).toHaveText('Romans 8:28–29 · BSB and');

  // A click keeps it open after the mouse leaves.
  await chip(page, 'Romans 8:28–29').hover();
  await expect(viewer(page)).toBeVisible();
  await chip(page, 'Romans 8:28–29').click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(500);
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toBeHidden();
});

test('with "Show verse text in notes" on (the default), a paragraph’s chips show their text under it', async ({
  page,
}) => {
  await startLesson(page);
  await page.keyboard.type('Paul says in Rom 8:38-9:1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('and Ps 23:1');
  await page.keyboard.press('Enter');
  const preview = note(page).locator('[data-verse-preview]');
  const lesson = page.url();
  const setting = page.getByRole('switch', { name: /Show verse text in notes/ });

  // One quote under the paragraph, numbered, a new chapter with its number; not part of the note.
  await expect(preview).toHaveCount(1);
  await expect(preview).toContainText('Romans 8:38–9:1 · BSB');
  await expect(preview).toContainText('Psalm 23:1 · BSB');
  await expect(preview.locator('sup')).toHaveText(['38', '39', '9:1', '1']);
  await expect(preview).toContainText('1A Psalm of David. The LORD is my shepherd');
  await expect
    .poll(() => chips(page))
    .toEqual([
      expect.objectContaining({ display: 'Romans 8:38–9:1' }),
      expect.objectContaining({ display: 'Psalm 23:1' }),
    ]);

  // Turned off: gone.
  await page.goto('/settings');
  await setting.click();
  await expect(setting).not.toBeChecked();
  await page.goto(lesson);
  await expect(note(page)).toContainText('Psalm 23:1 · BSB');
  await expect(preview).toHaveCount(0);
});

test('from the keyboard: arrow onto a chip, Enter opens it, Backspace deletes it whole', async ({
  page,
}) => {
  await startLesson(page);
  await page.keyboard.type('see Ps 23:1');
  await page.keyboard.press('Enter');
  // Right after the chip (the space that follows it gone), ← selects it.
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(viewer(page)).toContainText('The LORD is my shepherd');
  await page.keyboard.press('Escape');
  await expect(viewer(page)).toBeHidden();
  await expect(note(page)).toBeFocused();
  // Still selected: Space opens it again.
  await page.keyboard.press('Space');
  await expect(viewer(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(paragraphs(page)).toHaveText('see Psalm 23:1 · BSB');

  // → leaves it; Backspace then deletes it whole.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Backspace');
  await expect(paragraphs(page)).toHaveText('see ');
  await expect.poll(() => chips(page)).toEqual([]);
});

test('a chip inserted before its book was downloaded gets its text when it arrives', async ({
  page,
  context,
}) => {
  const letThrough = await withoutBook(page, '1JN');
  await startLesson(page);
  await context.setOffline(true);
  await page.keyboard.type('1 Jn 3');
  await page.keyboard.press('Enter');
  await chip(page, '1 John 3').click();
  await expect(viewer(page)).toContainText(
    'Text not downloaded yet. It’s added when the Bible is downloaded.',
  );
  await page.keyboard.press('Escape');
  await expect
    .poll(() => chips(page))
    .toEqual([expect.not.objectContaining({ snapshotText: expect.anything() })]);

  // Back online, the download goes on; the chip gets its text, in the note and as stored.
  await letThrough();
  await context.setOffline(false);
  await expect
    .poll(() => chips(page), { timeout: 15_000 })
    .toEqual([
      expect.objectContaining({
        display: '1 John 3',
        snapshotText: expect.stringMatching(
          /^Behold what manner of love the Father has given to us/,
        ),
      }),
    ]);
  await chip(page, '1 John 3').click();
  await expect(viewer(page)).toContainText('Behold what manner of love the Father');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the list sits above the editing toolbar, and a tap inserts', async ({ page }) => {
    await startLesson(page);
    await page.keyboard.type('Rom 8:28');
    const toolbar = page.getByRole('toolbar', { name: 'Editing' });
    await expect(list(page)).toBeVisible();
    const [listBox, toolbarBox] = await Promise.all([
      list(page).boundingBox(),
      toolbar.boundingBox(),
    ]);
    expect(listBox!.y + listBox!.height).toBeLessThanOrEqual(toolbarBox!.y);
    expect(listBox!.x).toBeGreaterThanOrEqual(0);
    expect(listBox!.x + listBox!.width).toBeLessThanOrEqual(360);

    await option(page, /^Romans 8:28/).tap();
    await expect(note(page)).toBeFocused();
    await expect(paragraphs(page)).toHaveText('Romans 8:28 · BSB ');
  });

  test('a tapped chip opens in a sheet without bringing up the keyboard', async ({ page }) => {
    await startLesson(page);
    await page.keyboard.type('Rom 8:28');
    await page.keyboard.press('Enter');
    await note(page).blur();
    await chip(page, 'Romans 8:28').tap();
    await expect(viewer(page)).toContainText(
      'And we know that God works all things together for the good',
    );
    // At the bottom of the screen, once it has slid in.
    await expect
      .poll(async () => {
        const box = await viewer(page).boundingBox();
        return Math.round(box!.y + box!.height);
      })
      .toBe(740);
    await viewer(page).getByRole('button', { name: 'Close' }).tap();
    await expect(viewer(page)).toBeHidden();
    await expect(note(page)).not.toBeFocused();
  });
});
