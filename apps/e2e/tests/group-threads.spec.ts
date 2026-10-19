import { type Browser, expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson, rows } from './helpers.ts';

// Group threads (F35, M13-08 to M13-10, wireframes/sharing.md) against the real API, in two
// browsers: Ann shares a section of her lesson with her group and keeps a note private; Ben,
// who joined, reads it, comments, replies and asks a question; Ann answers it from the group's
// questions, and Ben sees who answered.

const RUN = Date.now().toString(36);
const PASSWORD = 'lamp unto my feet 119';

const status = (page: Page) => page.getByRole('complementary').getByRole('status');

/** A new browser with a verified account, on the Lessons home. */
async function person(browser: Browser, baseURL: string | undefined, name: string) {
  const context = await browser.newContext({
    baseURL,
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL!, localStorage: [{ name: 'lamp.welcomed', value: 'e2e' }] }],
    },
  });
  const page = await context.newPage();
  const email = `thread.${name}.${RUN}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await linkTo(email, '/verify-email'));
  await expect(page.getByText('Email verified.')).toBeVisible();
  await page.goto('/');
  await expect(status(page)).toHaveText('Synced');
  return { context, page };
}

/** Everything the device wrote has been pushed: its outbox is empty, and it says Synced. */
async function pushed(page: Page) {
  await expect.poll(async () => (await rows(page, 'outbox')).length).toBe(0);
  await expect(status(page)).toHaveText('Synced');
}

/** Types into an editor and leaves it, which saves it. */
async function write(page: Page, editor: ReturnType<Page['getByRole']>, text: string) {
  await editor.click();
  await page.keyboard.type(text);
  await editor.blur();
}

test("a lesson's group thread, its comments, and the group's questions", async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(120_000);
  const ann = await person(browser, baseURL, 'ann');
  const page = ann.page;

  // Ann's lesson in her series John, and a group around the series.
  await newLesson(page, 'The Good Shepherd');
  await page.getByRole('combobox', { name: 'Series' }).selectOption({ label: 'Create series…' });
  await page.getByRole('dialog').getByLabel('Name').fill('John');
  await page.getByRole('button', { name: 'Create series' }).click();
  await expect(page.getByRole('combobox', { name: 'Series' })).toHaveValue(/.+/);
  const lessonUrl = page.url().split('?')[0]!;
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' }).click();
  await page.getByRole('button', { name: 'Series actions' }).click();
  await page.getByRole('menuitem', { name: 'Study with a group…' }).click();
  const create = page.getByRole('dialog', { name: 'New group' });
  await create.getByLabel('Name', { exact: true }).fill('Thursday group');
  await create.getByLabel('Your name in this group').fill('Ann');
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('heading', { name: 'Thursday group' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite people' }).click();
  const invite = new URL(await page.getByRole('textbox', { name: 'Invite link' }).inputValue());
  await page.keyboard.press('Escape');

  // Her lesson opens on the group thread: a section for the group, then a private note.
  await page.goto(lessonUrl);
  await expect(page.getByRole('radio', { name: 'Group thread' })).toBeChecked();
  await expect(page.getByText('Nothing in the group thread yet.', { exact: false })).toBeVisible();
  await write(
    page,
    page.getByRole('textbox', { name: 'Add to the group thread' }),
    'The door is the only way in.',
  );
  await expect(page.getByText('You ·', { exact: false })).toBeVisible();
  await page.getByRole('radio', { name: 'My notes' }).click();
  await write(page, page.getByRole('textbox', { name: 'Note' }).first(), 'Ask Ben about this.');
  await pushed(page);

  // Ben joins, and opens the lesson from the group.
  const ben = await person(browser, baseURL, 'ben');
  await ben.page.goto(invite.pathname + invite.search);
  await ben.page.getByLabel('Your name in this group').fill('Ben');
  await ben.page.getByRole('button', { name: 'Join group' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Thursday group' })).toBeVisible();
  await ben.page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' }).click();
  await ben.page.getByRole('link', { name: /The Good Shepherd/ }).click();
  const thread = ben.page.getByRole('main');
  await expect(thread.getByText('The door is the only way in.')).toBeVisible();
  await expect(thread.getByText('Ann ·', { exact: false })).toBeVisible();
  await expect(thread.getByText('Ask Ben about this.')).toHaveCount(0);

  // A comment, whose reference becomes a chip; a reply; a question for the group.
  await thread.getByRole('button', { name: 'No comments · Comment' }).click();
  await thread.getByRole('textbox', { name: 'Add a comment' }).fill('And John 10:9 too');
  await ben.page.keyboard.press('Enter');
  await expect(thread.getByRole('button', { name: /John 10:9/ })).toBeVisible();
  await thread.getByRole('button', { name: "Actions for Ann's section" }).click();
  await ben.page.getByRole('menuitem', { name: 'Reply' }).click();
  const reply = thread.getByRole('textbox', { name: 'Reply' });
  await expect(reply).toBeFocused();
  await ben.page.keyboard.type('Like Psalm 23.');
  await reply.blur();
  await expect(thread.getByText('You ·', { exact: false })).toBeVisible();
  await ben.page.getByRole('button', { name: 'Add group question' }).click();
  await ben.page
    .getByRole('textbox', { name: 'New group question' })
    .fill('Who are the other sheep?');
  await ben.page.keyboard.press('Enter');
  await expect(ben.page.getByText('Who are the other sheep?')).toBeVisible();
  // His own notes on it stay his.
  await ben.page.getByRole('radio', { name: 'My notes' }).click();
  await write(ben.page, ben.page.getByRole('textbox', { name: 'Note' }).first(), 'Still unsure.');
  await pushed(ben.page);
  // His own lesson for it isn't on his Lessons home: it opens from the group.
  await ben.page.goto('/');
  await expect(ben.page.getByRole('main').getByText('The Good Shepherd')).toHaveCount(0);

  // Ann sees Ben's reply, his comment and his question, never his notes.
  await page.goto(lessonUrl);
  await expect(page.getByText('Like Psalm 23.')).toBeVisible();
  await expect(page.getByText('Ben ·', { exact: false }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: '1 comment' })).toBeVisible();
  await expect(page.getByText('Still unsure.')).toHaveCount(0);

  // She answers from the group's questions.
  await page.goto('/');
  await page.getByRole('link', { name: 'Thursday group · 2 members' }).click();
  await page.getByRole('link', { name: 'Questions · 1 open' }).click();
  await expect(page.getByText('Ben · The Good Shepherd', { exact: false })).toBeVisible();
  await page.getByRole('link', { name: 'Answer' }).click();
  const answer = page.getByRole('textbox', { name: 'Note' }).last();
  await expect(answer).toBeFocused();
  await page.keyboard.type('The Gentiles, gathered in.');
  await answer.blur();
  await pushed(page);

  await ben.page.goto('/');
  await ben.page.getByRole('link', { name: 'Thursday group · 2 members' }).click();
  await ben.page.getByRole('link', { name: 'Questions · 0 open' }).click();
  await ben.page.getByRole('radio', { name: 'Answered 1' }).click();
  await expect(ben.page.getByText('Answered by Ann', { exact: false })).toBeVisible();

  await ann.context.close();
  await ben.context.close();
});
