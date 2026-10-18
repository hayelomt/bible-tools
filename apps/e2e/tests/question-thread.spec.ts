import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Question threads (F24, M10-09 to M10-11): a question revisited from another lesson is one
// thread across both; its page lists the entries in date order, Answer adds a section to the
// latest lesson, Reopen puts an answered question back in Review; Split and Merge keep entries.

interface StoredEntry {
  questionId: string;
  kind: string;
  deletedAt: string | null;
}
interface StoredQuestion {
  id: string;
  text: string;
  deletedAt: string | null;
}

const live = <T extends { deletedAt: string | null }>(all: T[]) =>
  all.filter((row) => row.deletedAt === null);
const questionList = (page: Page) =>
  page.getByRole('region', { name: 'Questions' }).getByRole('listitem');
const thread = (page: Page) => page.getByRole('list', { name: 'Thread' }).getByRole('listitem');

/** A new lesson with these questions, added from the Questions panel's + Add. */
async function lessonAsking(page: Page, title: string, ...questions: string[]) {
  await page.goto('/');
  await newLesson(page, title);
  for (const [i, text] of questions.entries()) {
    if (i === 0) {
      await page.getByRole('button', { name: 'Add question' }).click();
      await page.getByRole('menuitem', { name: 'New question' }).click();
    }
    const field = page.getByRole('textbox', { name: 'New question' });
    await field.fill(text);
    await field.press('Enter');
  }
  if (questions.length > 0)
    await page.getByRole('textbox', { name: 'New question' }).press('Escape');
}

/** Opens a question's thread from its lesson's Questions panel. */
async function openThread(page: Page, text: string) {
  await questionList(page)
    .filter({ hasText: text })
    .getByRole('button', { name: 'Question actions' })
    .click();
  await page.getByRole('menuitem', { name: 'Thread' }).click();
  await expect(page.getByRole('heading', { level: 2, name: text })).toBeVisible();
}

test('a question revisited from a second lesson is one thread, answered there and reopened', async ({
  page,
}) => {
  await lessonAsking(page, 'The Good Shepherd', 'Who are the other sheep?');
  await expect(questionList(page)).toHaveText(['Open: Who are the other sheep?']);

  // Revisit from another lesson: an entry there, not a copy.
  await lessonAsking(page, 'Lazarus');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByRole('menuitem', { name: 'Revisit a question…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Revisit a question' });
  await dialog.getByRole('searchbox', { name: 'Search questions' }).fill('sheep');
  await dialog.getByRole('button', { name: 'Revisit' }).click();
  await expect(questionList(page)).toHaveText([
    /^Revisited here, open: Who are the other sheep\?first asked .+ · 2 entries$/,
  ]);
  await expect.poll(async () => (await rows<StoredQuestion>(page, 'question')).length).toBe(1);

  // Its thread names both lessons, in date order.
  await openThread(page, 'Who are the other sheep?');
  const address = page.url();
  await expect(page.getByText(/^Open · Asked 2 times since \w+$/)).toBeVisible();
  await expect(thread(page)).toHaveText([
    /^Asked · .+The Good Shepherd$/,
    /^Revisited · .+Lazarus$/,
  ]);

  // Answer adds a section to the latest entry's lesson, headed with the question.
  await page.getByRole('link', { name: 'Answer', exact: true }).click();
  const answer = page.locator('[data-section]').filter({ hasText: 'Who are the other sheep?' });
  await expect(answer.getByRole('heading', { level: 3 })).toHaveText('Who are the other sheep?');
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue('Lazarus');
  await expect(answer.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('Gentiles, brought into one flock.');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'section')))
    .toContain('Gentiles, brought into one flock.');

  await page.goto(address);
  await expect(page.getByText(/^Answered · Asked 2 times since \w+$/)).toBeVisible();
  await expect(thread(page)).toHaveText([
    /^Asked · .+The Good Shepherd$/,
    /^Revisited · .+Lazarus$/,
    /^Answered · .+Lazarus“Gentiles, brought into one flock\.”$/,
  ]);
  await page.goto('/review');
  await expect(
    page.getByRole('link', { name: 'Who are the other sheep?', exact: true }),
  ).toBeHidden();

  // Reopening the answered question puts it back in Review, with its lineage.
  await page.goto(address);
  await page.getByRole('button', { name: 'Question actions' }).click();
  await page.getByRole('menuitem', { name: 'Reopen' }).click();
  await expect(thread(page).last()).toHaveText(/^Reopened · /);
  await page.goto('/review');
  const queued = page.getByRole('listitem').filter({ hasText: 'Who are the other sheep?' });
  await expect(queued).toContainText(/Asked 2 times since \w+/);
  await queued.getByRole('link', { name: 'Who are the other sheep?', exact: true }).click();
  await expect(page).toHaveURL(address);
});

test('split and merge move entries between questions, losing and copying none', async ({
  page,
}) => {
  await lessonAsking(
    page,
    'The Good Shepherd',
    'Who are the other sheep, and why one flock?',
    'One flock, one shepherd?',
  );
  await openThread(page, 'Who are the other sheep, and why one flock?');

  // Split: the first keeps its entry; the second starts "Split from …".
  await page.getByRole('button', { name: 'Question actions' }).click();
  await page.getByRole('menuitem', { name: 'Split…' }).click();
  const split = page.getByRole('dialog', { name: 'Split this question' });
  await split.getByRole('textbox', { name: 'Question 1' }).fill('Who are the other sheep?');
  await split.getByRole('textbox', { name: 'Question 2' }).fill('Why one flock?');
  await split.getByRole('button', { name: 'Split' }).click();
  await expect(page.getByRole('heading', { level: 2, name: 'Why one flock?' })).toBeVisible();
  await expect(page.getByText(/^Split from “Who are the other sheep\?” on /)).toBeVisible();
  await expect(thread(page)).toHaveText([/^Asked · .+The Good Shepherd$/]);

  // Merge it into another: one thread of both, and the first is gone.
  await page.getByRole('button', { name: 'Question actions' }).click();
  await page.getByRole('menuitem', { name: 'Merge with…' }).click();
  const merge = page.getByRole('dialog', { name: 'Merge with…' });
  await merge.getByRole('searchbox', { name: 'Search questions' }).fill('shepherd');
  await merge.getByRole('button', { name: 'Next' }).click();
  await page
    .getByRole('dialog', { name: 'Merge “Why one flock?” into “One flock, one shepherd?”?' })
    .getByRole('button', { name: 'Merge' })
    .click();
  await expect(
    page.getByRole('heading', { level: 2, name: 'One flock, one shepherd?' }),
  ).toBeVisible();
  await expect(thread(page)).toHaveCount(2);

  await expect
    .poll(async () => live(await rows<StoredQuestion>(page, 'question')).map((q) => q.text))
    .toEqual(expect.arrayContaining(['Who are the other sheep?', 'One flock, one shepherd?']));
  const questions = live(await rows<StoredQuestion>(page, 'question'));
  expect(questions).toHaveLength(2);
  const entries = live(await rows<StoredEntry>(page, 'questionEntry'));
  // Three asked entries: the two questions', and the split's; each on one live question.
  expect(entries.map((e) => e.kind)).toEqual(['asked', 'asked', 'asked']);
  expect(new Set(entries.map((e) => e.questionId))).toEqual(new Set(questions.map((q) => q.id)));
});
