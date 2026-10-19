import { type Browser, expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson, rows } from './helpers.ts';

// The M13 gate (PRD v2 milestones J): a lesson opened by its link in a signed-out browser; two
// members study a shared series, each adds a question to the group thread, one answers the
// other's, and the group's questions show both. Ann shares her lesson by link and makes a group
// around its series; Ben joins by the invite. Each asks a question; Ben answers Ann's from the
// group's questions, and both see one open and one answered.

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
  const email = `gate.${name}.${RUN}@example.com`;
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

/** Asks the group a question from the lesson's group thread. */
async function ask(page: Page, text: string) {
  await expect(page.getByRole('radio', { name: 'Group thread' })).toBeChecked();
  await page.getByRole('button', { name: 'Add group question' }).click();
  await page.getByRole('textbox', { name: 'New group question' }).fill(text);
  await page.keyboard.press('Enter');
  await expect(page.getByText(text)).toBeVisible();
}

/** The group's questions, from the Lessons home. */
async function queue(page: Page) {
  await page.goto('/');
  await page
    .getByRole('main')
    .getByRole('link', { name: /Thursday group · 2 members/ })
    .click();
  await page.getByRole('link', { name: /^Questions · \d open$/ }).click();
  await expect(page.getByRole('heading', { name: 'Questions · Thursday group' })).toBeVisible();
}

test('a lesson read by link, and two members answering each other in a group', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(150_000);
  const ann = await person(browser, baseURL, 'ann');
  const page = ann.page;

  // Ann's lesson, with a note, in her series John.
  await newLesson(page, 'The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.type('Jesus is the door and the shepherd.');
  await page.getByRole('combobox', { name: 'Series' }).selectOption({ label: 'Create series…' });
  await page.getByRole('dialog').getByLabel('Name').fill('John');
  await page.getByRole('button', { name: 'Create series' }).click();
  await expect(page.getByRole('combobox', { name: 'Series' })).toHaveValue(/.+/);
  const lessonUrl = page.url().split('?')[0]!;
  await pushed(page);

  // A link to the lesson, opened in a browser with no account.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Share link…' }).click();
  const share = page.getByRole('dialog', { name: 'Share “The Good Shepherd”' });
  await share.getByRole('button', { name: 'Create link' }).click();
  const link = new URL(await share.getByRole('textbox', { name: 'Link' }).inputValue());
  await page.keyboard.press('Escape');
  const reader = await browser.newContext({ baseURL });
  const shared = await reader.newPage();
  await shared.goto(link.pathname);
  await expect(shared.getByRole('heading', { name: 'The Good Shepherd' })).toBeVisible();
  await expect(shared.getByText('Jesus is the door and the shepherd.')).toBeVisible();
  expect(await reader.cookies()).toEqual([]);
  await reader.close();

  // A group around John, and its invite.
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

  // Ann asks the group a question; her note stays hers.
  await page.goto(lessonUrl);
  await ask(page, 'Who is the hired hand?');
  await pushed(page);

  // Ben joins, opens the lesson from the group, and asks his own.
  const ben = await person(browser, baseURL, 'ben');
  await ben.page.goto(invite.pathname + invite.search);
  await ben.page.getByLabel('Your name in this group').fill('Ben');
  await ben.page.getByRole('button', { name: 'Join group' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Thursday group' })).toBeVisible();
  await ben.page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' }).click();
  await ben.page.getByRole('link', { name: /The Good Shepherd/ }).click();
  await expect(ben.page.getByText('Who is the hired hand?')).toBeVisible();
  await expect(ben.page.getByText('Jesus is the door and the shepherd.')).toHaveCount(0);
  await ask(ben.page, 'Who are the other sheep?');
  await pushed(ben.page);

  // He answers Ann's from the group's questions.
  await queue(ben.page);
  await expect(ben.page.getByRole('radio', { name: 'Open 2' })).toBeChecked();
  const hers = ben.page.getByRole('listitem').filter({ hasText: 'Who is the hired hand?' });
  await expect(hers.getByText('Ann · The Good Shepherd', { exact: false })).toBeVisible();
  await hers.getByRole('link', { name: 'Answer' }).click();
  const answer = ben.page.getByRole('textbox', { name: 'Note' }).last();
  await expect(answer).toBeFocused();
  await ben.page.keyboard.type('One who runs when the wolf comes.');
  await answer.blur();
  await pushed(ben.page);

  // Both see both: Ben's open, Ann's answered by Ben; each sees their own as You's.
  for (const [who, asAnn, asBen] of [
    [ann.page, 'You', 'Ben'],
    [ben.page, 'Ann', 'You'],
  ] as const) {
    await queue(who);
    await expect(who.getByRole('radio', { name: 'Open 1' })).toBeChecked();
    const open = who.getByRole('main').getByRole('listitem');
    await expect(open).toHaveCount(1);
    await expect(open.getByText('Who are the other sheep?')).toBeVisible();
    await expect(open.getByText(`${asBen} · The Good Shepherd`, { exact: false })).toBeVisible();
    await who.getByRole('radio', { name: 'Answered 1' }).click();
    const answered = who.getByRole('main').getByRole('listitem');
    await expect(answered.getByText('Who is the hired hand?')).toBeVisible();
    await expect(
      answered.getByText(`${asAnn} · The Good Shepherd`, { exact: false }),
    ).toBeVisible();
    await expect(answered.getByText(`Answered by ${asBen}`, { exact: false })).toBeVisible();
  }

  await ann.context.close();
  await ben.context.close();
});
