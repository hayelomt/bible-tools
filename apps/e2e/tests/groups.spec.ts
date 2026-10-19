import { type Browser, expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson } from './helpers.ts';

// Groups (F35, M13-07, wireframes/sharing.md) against the real API, in two browsers: Ann makes a
// group around her series and invites Ben, who joins by the link and reads its lessons; she hands
// him the group, he removes her, and her series leaves with her at her next sync.

const RUN = Date.now().toString(36);
const PASSWORD = 'lamp unto my feet 119';

const status = (page: Page) => page.getByRole('complementary').getByRole('status');

/** A new browser with a verified account, on the Lessons home. */
async function person(browser: Browser, baseURL: string | undefined, name: string) {
  // As the config's own context: past the first-run welcome.
  const context = await browser.newContext({
    baseURL,
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL!, localStorage: [{ name: 'lamp.welcomed', value: 'e2e' }] }],
    },
  });
  const page = await context.newPage();
  const email = `group.${name}.${RUN}@example.com`;
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

test('a group made, joined by its invite, handed over, and its owner removed', async ({
  browser,
  baseURL,
}) => {
  test.setTimeout(90_000);
  const ann = await person(browser, baseURL, 'ann');
  const page = ann.page;

  // A lesson in a new series, then a group around the series from its ⋯.
  await newLesson(page, 'The Good Shepherd');
  await page.getByRole('combobox', { name: 'Series' }).selectOption({ label: 'Create series…' });
  await page.getByRole('dialog').getByLabel('Name').fill('John');
  await page.getByRole('button', { name: 'Create series' }).click();
  await expect(page.getByRole('combobox', { name: 'Series' })).toHaveValue(/.+/);
  await page.goto('/');
  await page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' }).click();
  await expect(page.getByRole('heading', { name: 'John' })).toBeVisible();
  await expect(status(page)).toHaveText('Synced');

  await page.getByRole('button', { name: 'Series actions' }).click();
  await page.getByRole('menuitem', { name: 'Study with a group…' }).click();
  const create = page.getByRole('dialog', { name: 'New group' });
  await create.getByLabel('Name', { exact: true }).fill('Thursday group');
  await expect(create.getByLabel('Series')).toHaveValue(/.+/);
  await create.getByRole('button', { name: 'Create' }).click();
  await expect(create.getByText('Members need a name to know you by.')).toBeVisible();
  await create.getByLabel('Your name in this group').fill('Ann');
  await create.getByRole('button', { name: 'Create' }).click();

  await expect(page.getByRole('heading', { name: 'Thursday group' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Members · 1' })).toBeVisible();

  // The invite, from the owner's page.
  await page.getByRole('button', { name: 'Invite people' }).click();
  const invite = page.getByRole('dialog', { name: 'Invite people' });
  const field = invite.getByRole('textbox', { name: 'Invite link' });
  await expect(field).toHaveValue(/\/join\?token=[A-Za-z0-9_-]{43}$/);
  const url = new URL(await field.inputValue());
  await page.keyboard.press('Escape');

  // Signed out, the invite asks to sign in first and comes back.
  const stranger = await browser.newContext({ baseURL });
  const signedOut = await stranger.newPage();
  await signedOut.goto(url.pathname + url.search);
  await expect(signedOut.getByRole('heading', { name: 'Join Thursday group?' })).toBeVisible();
  await expect(signedOut.getByRole('link', { name: 'Sign in to join' })).toHaveAttribute(
    'href',
    /\/signin\?next=/,
  );
  await stranger.close();

  // Ben joins with the link.
  const ben = await person(browser, baseURL, 'ben');
  await ben.page.goto(url.pathname + url.search);
  await expect(ben.page.getByText('Ann invited you to study John with them.')).toBeVisible();
  await ben.page.getByLabel('Your name in this group').fill('Ben');
  await ben.page.getByRole('button', { name: 'Join group' }).click();
  await expect(ben.page.getByRole('heading', { name: 'Thursday group' })).toBeVisible();
  // A member doesn't invite; he reads the series' lessons, read-only.
  await expect(ben.page.getByRole('button', { name: 'Invite people' })).toHaveCount(0);
  await ben.page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' }).click();
  await ben.page.getByRole('link', { name: /The Good Shepherd/ }).click();
  await expect(ben.page.getByRole('heading', { name: 'The Good Shepherd' })).toBeVisible();
  await ben.page.goto('/');
  await expect(ben.page.getByRole('link', { name: 'Thursday group · 2 members' })).toBeVisible();

  // Ann sees him after a sync, and makes him the owner.
  await page.reload();
  await page.getByRole('link', { name: 'Members · 2' }).click();
  await expect(page.getByText('You · owner')).toBeVisible();
  await expect(page.getByText('Ben · member')).toBeVisible();
  await page.getByRole('button', { name: 'Actions for Ben' }).click();
  await page.getByRole('menuitem', { name: 'Make owner…' }).click();
  await page.getByRole('button', { name: 'Make owner' }).click();
  await expect(page.getByText('Ben is the owner now.')).toBeVisible();
  await expect(page.getByText('You · member')).toBeVisible();

  // Ben, now the owner, removes Ann: John was hers, so it leaves the group with her.
  await ben.page.reload();
  await ben.page.getByRole('link', { name: 'Thursday group · 2 members' }).click();
  await ben.page.getByRole('link', { name: 'Members · 2' }).click();
  await ben.page.getByRole('button', { name: 'Actions for Ann' }).click();
  await ben.page.getByRole('menuitem', { name: 'Remove…' }).click();
  const remove = ben.page.getByRole('dialog', { name: 'Remove Ann from Thursday group?' });
  await expect(
    remove.getByText('Ann loses access on their next sync.', { exact: false }),
  ).toBeVisible();
  await remove.getByRole('button', { name: 'Remove Ann' }).click();
  await expect(ben.page.getByText('Ann was removed.')).toBeVisible();
  await ben.page.getByRole('link', { name: 'Back' }).click();
  await expect(ben.page.getByText('No series yet.', { exact: false })).toBeVisible();

  // Ann's next sync takes the group away; her series and lesson stay hers.
  await page.goto('/');
  await expect(page.getByRole('link', { name: /Thursday group/ })).toHaveCount(0);
  await expect(page.getByRole('main').getByRole('link', { name: 'John · 1 lesson' })).toBeVisible();

  await ann.context.close();
  await ben.context.close();
});
