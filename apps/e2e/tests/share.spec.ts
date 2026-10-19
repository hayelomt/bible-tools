import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The share screen (F18, M9-06) and Add from clipboard (M9-07): what a share holds, found and
// labelled, then to the inbox, the lesson open in the last 10 minutes, or another lesson.

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });
const item = (page: Page, name: string) => page.getByRole('article', { name });

const GOOD_SHEPHERD = 'I am the good shepherd. The good shepherd lays down His life for the sheep.';
/** What the YouVersion app shares: the verse, its reference and version, and its address. */
const YOUVERSION = `“${GOOD_SHEPHERD}”\nJohn 10:11 BSB\n\nhttps://bible.com/bible/3034/jhn.10.11.BSB`;

const share = (fields: Record<string, string>) => `/share?${new URLSearchParams(fields)}`;

interface Item {
  origin: string;
  text: string | null;
  sourceUrl: string | null;
  ref: {
    display: string;
    translation?: string;
    versionLabel?: string;
    snapshotText?: string;
  } | null;
  placedInSectionId: string | null;
}

test.use({ viewport: { width: 390, height: 844 } });

test('a verse shared from YouVersion lands in the inbox, with Undo', async ({ page }) => {
  await page.goto(share({ text: YOUVERSION }));
  await expect(heading(page)).toHaveText('Shared to Lamp');
  await expect(page.getByText('John 10:11 · BSB')).toBeVisible();
  await expect(page.getByText(GOOD_SHEPHERD)).toBeVisible();
  await expect(page.getByText('from bible.com/bible/3034/jhn.10.11.BSB')).toBeVisible();
  // No lesson open lately: the inbox is the one choice.
  await expect(page.getByRole('button', { name: /^Add to (?!inbox|another)/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Add to inbox' }).click();
  await expect(heading(page)).toHaveText('Inbox');
  await expect(toast(page, 'Added to your inbox.')).toBeVisible();
  const verse = item(page, 'John 10:11');
  await expect(verse).toContainText('Shared · bible.com');
  expect(await rows<Item>(page, 'inboxItem')).toMatchObject([
    {
      origin: 'share',
      text: null,
      sourceUrl: 'https://bible.com/bible/3034/jhn.10.11.BSB',
      // The passage alone: its text is read from the BSB (decision 97).
      ref: { book: 'JHN', chapter: 10, verseStart: 11, display: 'John 10:11' },
    },
  ]);
  expect((await rows<Item>(page, 'inboxItem'))[0]?.ref).not.toHaveProperty('snapshotText');

  await toast(page, 'Added to your inbox.').getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();
});

test('within 10 minutes of a lesson, one more tap puts the share in it', async ({ page }) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  await page.goto(share({ text: YOUVERSION }));
  const toLesson = page.getByRole('button', { name: 'Add to The Good Shepherd' });
  await expect(toLesson).toBeVisible();
  await toLesson.click();
  await expect(toast(page, 'Added to The Good Shepherd.')).toBeVisible();
  await expect(page).toHaveURL(/\/lessons\//);
  await expect(page.getByText('John 10:11 · BSB').first()).toBeVisible();
  const [placed] = await rows<Item>(page, 'inboxItem');
  expect(placed?.placedInSectionId).toBeTruthy();

  // Undo takes the section and the item away again.
  await toast(page, 'Added to The Good Shepherd.').getByRole('button', { name: 'Undo' }).click();
  await expect.poll(async () => (await rows(page, 'inboxItem')).length).toBe(0);
  await expect(page.getByText('John 10:11 · BSB')).toHaveCount(0);
});

test('a share from another version keeps its text, labelled with the version', async ({ page }) => {
  const niv = 'For God so loved the world that he gave his one and only Son';
  await page.goto(
    share({ text: `${niv}\nJohn 3:16 NIV`, url: 'https://www.bible.com/bible/111/JHN.3.16.NIV' }),
  );
  await expect(page.getByText('John 3:16 · NIV')).toBeVisible();
  await page.getByRole('button', { name: 'Add to inbox' }).click();
  await expect(item(page, 'John 3:16')).toContainText(niv);
  expect((await rows<Item>(page, 'inboxItem'))[0]?.ref).toMatchObject({
    translation: 'shared',
    versionLabel: 'NIV',
    snapshotText: niv,
  });
});

test('several references each become an item, the rest a note on the first', async ({ page }) => {
  await page.goto(share({ text: 'Sermon notes: Romans 8:28, 38–39; Psalm 23:1 — never alone.' }));
  await expect(page.getByRole('heading', { name: 'Found 3' })).toBeVisible();
  const found = page.getByRole('list', { name: 'Verses found' });
  await expect(found.getByRole('checkbox')).toHaveCount(3);
  await found.getByRole('checkbox').nth(1).click();
  await page.getByRole('button', { name: 'Add 2 to inbox' }).click();

  await expect(page.getByRole('article')).toHaveCount(2);
  // In the order shared.
  await expect(page.getByRole('article').first()).toHaveAccessibleName('Romans 8:28');
  const added = await rows<Item>(page, 'inboxItem');
  expect(added.map((row) => [row.ref?.display, row.text]).toSorted()).toEqual([
    ['Psalm 23:1', null],
    ['Romans 8:28', 'Sermon notes: never alone.'],
  ]);
});

test('verse text without a reference is found by the matcher', async ({ page }) => {
  // Chrome slowed four times, as for the search index: the usual stand-in for a mid-range phone.
  await page.goto('/inbox');
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(share({ text: `Read this before Sunday: ${GOOD_SHEPHERD}` }));
  await expect(page.getByText('John 10:11 · BSB')).toBeVisible({ timeout: 30_000 });
  const ready = await page.waitForFunction(
    () =>
      (performance.getEntriesByName('lamp:verse-match-ready')[0] as PerformanceMark | undefined)
        ?.detail ?? null,
  );
  const { ms, verses, bytes, books } = (await ready.jsonValue()) as Record<string, number>;
  console.log(
    `Verse matcher: ${books} books, ${verses} verses in ${Math.round(ms!)} ms, ${(bytes! / 1e6).toFixed(1)} MB`,
  );
  expect(books).toBeGreaterThanOrEqual(66);
  expect(ms).toBeLessThan(2000);
  await expect(page.getByText('Read this before Sunday', { exact: true })).toBeVisible();
});

test('nothing shared says so', async ({ page }) => {
  await page.goto('/share');
  await expect(page.getByText('Nothing came through.')).toBeVisible();
  await page.getByRole('link', { name: 'Go to inbox' }).click();
  await expect(heading(page)).toHaveText('Inbox');
});

test('a note without a verse is kept as a note', async ({ page }) => {
  await page.goto(share({ text: 'Look up "hesed" before Sunday.' }));
  await expect(page.getByText('No verse found. It’s kept as a note.')).toBeVisible();
  await page.getByRole('button', { name: 'Add to another lesson…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add to a lesson' });
  await expect(dialog.getByRole('radio', { name: /New lesson/ })).toBeChecked();
  await dialog.getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Added to Look up "hesed" before Sunday.')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Look up "hesed" before Sunday.',
  );
});

test('Add from clipboard opens what was copied as a paste', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/inbox');
  await page.evaluate(() => navigator.clipboard.writeText('Psalm 23:1 for the funeral'));
  await page.getByRole('button', { name: 'Add from clipboard' }).click();
  await expect(heading(page)).toHaveText('From the clipboard');
  await expect(page.getByText('Psalm 23:1 · BSB')).toBeVisible();
  await page.getByRole('button', { name: 'Add to inbox' }).click();
  await expect(item(page, 'Psalm 23:1')).toContainText('Pasted ·');
  expect((await rows<Item>(page, 'inboxItem'))[0]).toMatchObject({
    origin: 'paste',
    text: 'for the funeral',
  });

  // An empty clipboard says so and stays put.
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await page.getByRole('button', { name: 'Add from clipboard' }).click();
  await expect(toast(page, 'The clipboard is empty.')).toBeVisible();
});
