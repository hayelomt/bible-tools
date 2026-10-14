import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The review queue (F9, M6-03): open questions with Answer, Park and Open lesson, the takeaways
// of the last `reviewWindowDays`, the count on the Review tab, and "All caught up."

interface StoredQuestion {
  text: string;
  status: string;
}

const QUESTIONS = [
  'Who are the other sheep?',
  'Thief or hired hand?',
  'What is the door?',
  'Why lay down his life?',
  'One flock?',
  'What is abundant life?',
];

test.use({ viewport: { width: 390, height: 844 } });

/** The + button a phone adds takeaways and questions with. */
async function addFromButton(page: Page, item: 'Add takeaway' | 'Add question') {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole('button', { name: 'Add to lesson' }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

const queue = (page: Page) =>
  page.getByRole('region', { name: /Open questions/ }).getByRole('listitem');
const reviewTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Review/ });

test('lists open questions and recent takeaways; Park and Answer work from the queue', async ({
  page,
}) => {
  await page.goto('/review');
  await expect(page.getByText('All caught up.')).toBeVisible();
  await expect(
    page.getByText('No open questions and no verses due. Takeaways from the last 14 days'),
  ).toBeVisible();
  await expect(reviewTab(page)).toHaveAccessibleName('Review');

  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await addFromButton(page, 'Add takeaway');
  await page.keyboard.type('He knows his sheep by name.');
  await page.keyboard.press('Escape');
  await addFromButton(page, 'Add question');
  const field = page.getByRole('textbox', { name: 'New question' });
  for (const text of QUESTIONS) {
    await field.fill(text);
    await field.press('Enter');
  }
  await field.press('Escape');
  await expect.poll(async () => (await rows(page, 'question')).length).toBe(6);
  await expect.poll(async () => (await rows(page, 'takeaway')).length).toBe(1);

  await expect(reviewTab(page)).toHaveAccessibleName('Review 6 waiting');
  await reviewTab(page).click();
  await expect(page.getByRole('heading', { name: 'Open questions · 6' })).toBeVisible();
  // No memory verses yet: the block says how to add one.
  await expect(page.getByText('None yet. Choose Memorise')).toBeVisible();

  // Five show, then "Show all".
  await expect(queue(page)).toHaveCount(5);
  await expect(queue(page).first()).toContainText('Who are the other sheep?');
  await expect(queue(page).first()).toContainText('The Good Shepherd · ');
  await page.getByRole('button', { name: 'Show all 6' }).click();
  await expect(queue(page)).toHaveCount(6);

  // Takeaways from the last 14 days, each opening its lesson there.
  const takeaways = page.getByRole('region', { name: 'Takeaways · last 14 days' });
  await expect(takeaways.getByRole('link')).toHaveText([/He knows his sheep by name\./]);

  // Park: out of the queue at once, with Undo.
  await page.getByRole('button', { name: 'Park “Thief or hired hand?”' }).click();
  await expect(page.getByRole('heading', { name: 'Open questions · 5' })).toBeVisible();
  await expect(reviewTab(page)).toHaveAccessibleName('Review 5 waiting');
  const toast = page.locator('[data-sonner-toast]').filter({ hasText: 'Question parked.' });
  await toast.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Open questions · 6' })).toBeVisible();
  await page.getByRole('button', { name: 'Park “Thief or hired hand?”' }).click();
  await expect
    .poll(async () => (await rows<StoredQuestion>(page, 'question')).map((q) => q.status))
    .toContain('parked');

  // Answer: the lesson, with a section headed with the question and the cursor under it.
  await page.getByRole('link', { name: 'Answer “Who are the other sheep?”' }).click();
  await expect(page).toHaveURL(/\/lessons\/[\w-]+$/);
  const answer = page.locator('[data-section]').filter({ hasText: 'Who are the other sheep?' });
  await expect(answer.getByRole('heading', { level: 3 })).toHaveText('Who are the other sheep?');
  await expect(answer.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Other flocks, one shepherd.');
  await expect
    .poll(async () => {
      const stored = await rows<StoredQuestion>(page, 'question');
      return stored.find((q) => q.text === 'Who are the other sheep?')?.status;
    })
    .toBe('answered');
  await page.keyboard.press('Escape');

  // Back in the queue it's gone, and a reload of the lesson doesn't answer it again.
  await page.reload();
  await expect(page.locator('[data-section]').filter({ hasText: 'Who are' })).toHaveCount(1);
  await reviewTab(page).click();
  await expect(page.getByRole('heading', { name: 'Open questions · 4' })).toBeVisible();
  await expect(page.getByText('Who are the other sheep?')).toBeHidden();

  // Open lesson: the lesson, with the question shown.
  await page.getByRole('link', { name: 'Open lesson' }).first().click();
  await expect(page).toHaveURL(/\/lessons\/[\w-]+\?question=/);
  await expect(page.locator('[data-flash]')).toContainText('What is the door?');
});

test('the takeaway window is set in Settings and syncs', async ({ page }) => {
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await addFromButton(page, 'Add takeaway');
  await page.keyboard.type('He knows his sheep by name.');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await rows(page, 'takeaway')).length).toBe(1);

  await page.goto('/settings');
  const window = page.getByRole('group', { name: 'Takeaways from the last' });
  await expect(window.getByRole('radio', { name: '14 days' })).toBeChecked();
  await window.getByText('30 days').click();
  await expect(window.getByRole('radio', { name: '30 days' })).toBeChecked();
  await expect
    .poll(async () => (await rows<{ reviewWindowDays: number }>(page, 'userSettings'))[0])
    .toMatchObject({ reviewWindowDays: 30 });
  const outbox = await rows<{ entity: string; row: Record<string, unknown> }>(page, 'outbox');
  expect(outbox.filter((c) => c.entity === 'userSettings').at(-1)?.row).toMatchObject({
    reviewWindowDays: 30,
  });

  await reviewTab(page).click();
  await expect(page.getByRole('heading', { name: 'Takeaways · last 30 days' })).toBeVisible();
  await page.getByRole('link', { name: /He knows his sheep by name\./ }).click();
  await expect(page).toHaveURL(/\/lessons\/[\w-]+\?takeaway=/);
});
