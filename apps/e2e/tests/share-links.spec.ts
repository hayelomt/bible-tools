import { expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson } from './helpers.ts';

// Share links (F34, M13-04, wireframes/sharing.md) against the real API: a guest is asked to sign
// in; signed in, a lesson's link opens in a signed-out browser, shows in Settings with when it was
// opened, and stops working once revoked.

const RUN = Date.now().toString(36);
const PASSWORD = 'lamp unto my feet 119';

const status = (page: Page) => page.getByRole('complementary').getByRole('status');

async function openShare(page: Page) {
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Share link…' }).click();
  return page.getByRole('dialog', { name: 'Share “The Good Shepherd”' });
}

test('a lesson shared by link, opened signed out, then revoked', async ({
  page,
  context,
  browser,
  baseURL,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);

  // A guest has nothing on the server for a link to show.
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');
  await page.getByRole('textbox', { name: 'Title', exact: true }).press('Enter');
  await page.keyboard.type('Jesus is the door <b>and</b> the shepherd');
  let dialog = await openShare(page);
  await expect(dialog.getByText('Sign in to share a link.', { exact: false })).toBeVisible();
  await page.keyboard.press('Escape');
  const lessonUrl = page.url();

  // Signed up and verified, the lesson syncs.
  const email = `share.${RUN}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await page.goto(await linkTo(email, '/verify-email'));
  await expect(page.getByText('Email verified.')).toBeVisible();
  await page.goto(lessonUrl);
  await expect(status(page)).toHaveText('Synced');

  // Offline, the link can't be made.
  await context.setOffline(true);
  dialog = await openShare(page);
  await expect(dialog.getByText('Needs a connection')).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Create link' })).toBeDisabled();
  await context.setOffline(false);
  await page.keyboard.press('Escape');

  // A link for 7 days.
  dialog = await openShare(page);
  await expect(dialog.getByText('Anyone with the link can read this lesson.')).toBeVisible();
  await dialog.getByText('7 days', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Create link' }).click();
  const field = dialog.getByRole('textbox', { name: 'Link' });
  await expect(field).toHaveValue(/\/s\/[A-Za-z0-9_-]{43}$/);
  const url = await field.inputValue();
  await expect(dialog.getByText(/^Created \w{3} \d+ \w{3} · never opened$/)).toBeVisible();
  await expect(dialog.getByText(/^Expires \w{3} \d+ \w{3}/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Copy' }).click();
  await expect(page.getByText('Link copied.')).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
  await page.keyboard.press('Escape');

  // Someone without an account opens it: the lesson, read-only, its text escaped.
  const reader = await browser.newContext({ baseURL });
  const shared = await reader.newPage();
  await shared.goto(new URL(url).pathname);
  await expect(shared.getByRole('heading', { name: 'The Good Shepherd' })).toBeVisible();
  await expect(shared.getByText('Jesus is the door <b>and</b> the shepherd')).toBeVisible();
  expect(await reader.cookies()).toEqual([]);

  // The same link again from the dialog; Settings lists it, opened.
  dialog = await openShare(page);
  await expect(dialog.getByRole('textbox', { name: 'Link' })).toHaveValue(url);
  await page.keyboard.press('Escape');
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Shared links ›' }).click();
  await expect(page.getByRole('heading', { name: 'Shared links' })).toBeVisible();
  const row = page.getByRole('main').getByRole('listitem');
  await expect(row).toHaveCount(1);
  await expect(row.getByText('LESSON · The Good Shepherd')).toBeVisible();
  await expect(row.getByText(/· opened just now$/)).toBeVisible();

  // Revoked, it asks first; then the page is gone for the reader.
  await row.getByRole('button', { name: 'Revoke…' }).click();
  const confirm = page.getByRole('dialog', { name: 'Revoke the link to The Good Shepherd?' });
  await expect(confirm.getByText('Anyone who has it can’t open it any more.')).toBeVisible();
  await confirm.getByRole('button', { name: 'Revoke link' }).click();
  await expect(
    page.getByText('No shared links. Make one from a lesson’s, a series’ or a commentary’s ⋯.'),
  ).toBeVisible();
  await shared.reload();
  await expect(
    shared.getByRole('heading', { name: 'This link doesn’t work any more.' }),
  ).toBeVisible();
  await reader.close();
});
