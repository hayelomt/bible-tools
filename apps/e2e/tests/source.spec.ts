import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Sources (F28, M11-06 to M11-08): a lesson's source in its Details and under its title; a
// section's time opens the recording at that moment, a page is plain; print shows both.

interface Lesson {
  id: string;
  sourceType: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceStartedAt: string | null;
}
interface Section {
  sourceAt: string | null;
  sourcePage: string | null;
}

const notes = (page: Page) => page.locator('[data-section]');

async function setMoment(page: Page, index: number, typed: string) {
  await notes(page).nth(index).getByRole('button', { name: 'Section actions' }).click();
  await page.getByRole('menuitem', { name: 'Time or page…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Time or page' });
  await dialog.getByRole('textbox', { name: 'Time or page' }).fill(typed);
  await dialog.getByRole('button', { name: 'Save' }).click();
}

test.use({ viewport: { width: 390, height: 844 } });

test('a source shows on the lesson, a section’s time opens the recording there, and print shows them', async ({
  page,
}) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  // A lesson without a source is unchanged: no line under its title.
  await expect(page.getByRole('link', { name: /^Source:/ })).toBeHidden();

  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('radiogroup', { name: 'Source type' }).getByText('Sermon').click();
  await page.getByRole('textbox', { name: 'Source title' }).fill('Sunday service');
  // Not an address: said under the field, and the text stays.
  const link = page.getByRole('textbox', { name: 'Source link' });
  await link.fill('Sunday at Grace');
  await link.blur();
  await expect(page.getByText('This isn’t a web address.')).toBeVisible();
  await expect(link).toHaveValue('Sunday at Grace');
  await link.fill('youtube.com/watch?v=abc123');
  await link.blur();
  await expect(page.getByText('This isn’t a web address.')).toBeHidden();
  await expect
    .poll(async () => (await rows<Lesson>(page, 'lesson'))[0])
    .toMatchObject({
      sourceType: 'sermon',
      sourceTitle: 'Sunday service',
      sourceUrl: 'https://youtube.com/watch?v=abc123',
    });

  const source = page.getByRole('link', { name: /^Source: Sunday service · youtube\.com/ });
  await expect(source).toHaveAttribute('href', 'https://youtube.com/watch?v=abc123');
  await expect(source).toHaveAttribute('target', '_blank');

  // Two sections: a time into the recording, and a page.
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.type('Sheep know the voice.');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('The shepherd goes ahead.');
  await expect.poll(async () => (await rows(page, 'section')).length).toBe(2);

  await setMoment(page, 0, 'twelve');
  await expect(page.getByText('Type a time, like 9:45, or a page, like p. 112.')).toBeVisible();
  await page.getByRole('dialog', { name: 'Time or page' }).getByRole('textbox').fill('9:45');
  await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('dialog')).toBeHidden();
  const at = notes(page).nth(0).getByRole('link', { name: 'Open the recording at 09:45' });
  await expect(at).toHaveAttribute('href', 'https://youtube.com/watch?v=abc123&t=585');
  // The lesson had no start: midnight on its date, so the time reads as typed.
  const [lesson] = await rows<Lesson>(page, 'lesson');
  expect(new Date(lesson!.sourceStartedAt!).getHours()).toBe(0);

  await setMoment(page, 1, 'p. 112');
  await expect(notes(page).nth(1)).toContainText('p. 112');
  await expect(notes(page).nth(1).getByRole('link')).toHaveCount(0);
  const stored = await rows<Section>(page, 'section');
  expect(stored.map((s) => s.sourcePage).toSorted()).toEqual(['112', null]);

  // A link that can't jump opens at the start, and says so.
  await page.getByRole('button', { name: 'Details' }).click();
  await link.fill('gracechapel.org/sermons/good-shepherd');
  await link.blur();
  await expect(
    notes(page)
      .nth(0)
      .getByRole('link', { name: /09:45: open the recording at the start/ }),
  ).toHaveAttribute('href', 'https://gracechapel.org/sermons/good-shepherd');

  // Print: the source, and each section's time or page.
  await page.goto(`/lessons/${lesson!.id}/print`);
  const printed = page.getByRole('main');
  await expect(printed).toContainText(
    'Sermon: Sunday service · https://gracechapel.org/sermons/good-shepherd',
  );
  await expect(printed).toContainText('[09:45]');
  await expect(printed).toContainText('[p. 112]');
});
