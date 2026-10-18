import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The M9 gate (PRD v2 milestones F): verses from other apps land in the inbox and reach a lesson.
// On a phone: a YouVersion share of verse text and its address lands with a BSB chip and goes to
// a lesson in two taps; the export lands as one import, and importing it again adds nothing.
test.use({ viewport: { width: 390, height: 844 } });

const FIXTURE = fileURLToPath(
  new URL('../../web/src/import/fixtures/youversion-guess.json', import.meta.url),
);
const GOOD_SHEPHERD = 'I am the good shepherd. The good shepherd lays down His life for the sheep.';

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const heading = (page: Page) => page.getByRole('heading', { level: 1 });

interface Item {
  importId: string | null;
  ref: { display: string; translation: string; snapshotText?: string } | null;
  placedInSectionId: string | null;
}

test('a shared verse and an export land in the inbox, and the verse reaches a lesson', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  // A share from the YouVersion app: the verse's text, and its address with the version.
  await page.goto(
    `/share?${new URLSearchParams({
      text: `“${GOOD_SHEPHERD}”`,
      url: 'https://www.bible.com/bible/3034/JHN.10.11.BSB',
    })}`,
  );
  await expect(page.getByText('John 10:11 · BSB')).toBeVisible();
  await page.getByRole('button', { name: 'Add to inbox' }).click();
  await expect(heading(page)).toHaveText('Inbox');
  const verse = page.getByRole('article', { name: 'John 10:11' });
  await expect(verse).toContainText('John 10:11 · BSB');
  await expect(verse).toContainText(GOOD_SHEPHERD);

  // Two taps to the lesson: Send to lesson, then Add (the latest lesson is chosen).
  await verse.getByRole('button', { name: 'Send to lesson' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Sent to The Good Shepherd.')).toBeVisible();
  await expect(verse).toBeHidden();
  const [sent] = await rows<Item>(page, 'inboxItem');
  expect(sent).toMatchObject({
    ref: { display: 'John 10:11', translation: 'BSB', snapshotText: GOOD_SHEPHERD },
    placedInSectionId: expect.any(String),
  });
  await page.goto('/');
  await page.getByRole('link', { name: /The Good Shepherd/ }).click();
  await expect(
    page.getByRole('button', { name: /^John 10:11, Berean Standard Bible/ }),
  ).toBeVisible();

  // The export, from the Inbox's ⋯: one row for the import.
  await page.goto('/inbox');
  await page.getByRole('button', { name: 'Inbox actions' }).click();
  await page.getByRole('menuitem', { name: 'Import from YouVersion…' }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file…' }).click();
  await (await chooser).setFiles(FIXTURE);
  await expect(page.getByRole('dialog')).toContainText('Imported 8 into your inbox.');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('link', { name: /^YouVersion import · .*, 8 items$/ })).toBeVisible();

  // Again: nothing new.
  await page.getByRole('button', { name: 'Inbox actions' }).click();
  await page.getByRole('menuitem', { name: 'Import from YouVersion…' }).click();
  const again = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Choose file…' }).click();
  await (await again).setFiles(FIXTURE);
  await expect(page.getByRole('dialog')).toContainText('Nothing new: all 9 were already imported.');
  const items = await rows<Item>(page, 'inboxItem');
  expect(items.filter((item) => item.importId !== null)).toHaveLength(8);
});
