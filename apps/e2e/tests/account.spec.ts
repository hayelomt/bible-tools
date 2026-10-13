import { expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson } from './helpers.ts';

const RUN = Date.now().toString(36);
const PASSWORD = 'lamp unto my feet 119';
const NEW_PASSWORD = 'light unto my path 105';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
}

async function signOut(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: 'Sign out' }).click();
  // The dialog says the notes stay (§6.6).
  const dialog = page.getByRole('dialog', { name: 'Sign out?' });
  await expect(dialog.getByText('Your notes stay on this device.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(
    page.getByText('Signed out. Your notes stay on this device.', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign up' })).toBeVisible();
}

test('sign up, verify, change and reset the password, with links from tmp/emails', async ({
  page,
}) => {
  const email = `account.${RUN}@example.com`;
  await page.goto('/');
  await newLesson(page, 'Before the account');

  // Sign up from Settings; the lesson on the device is mentioned.
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Sign up' }).click();
  await expect(page.getByText('The lesson on this device joins the account.')).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('too short');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('At least 10 characters.')).toHaveAttribute('class', /destructive/);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send it again' })).toBeDisabled();
  await expect(page.getByText(/available in \d+ s/)).toBeVisible();

  // The link from the email verifies the account.
  await page.goto(await linkTo(email, '/verify-email'));
  await expect(page.getByText('Email verified.')).toBeVisible();
  // Opened again, it has been used, but the account is verified already.
  await page.reload();
  await expect(page.getByText('Email verified.')).toBeVisible();
  await page.goto('/settings');
  await expect(page.getByText(`${email} · verified`)).toBeVisible();

  // Change password: the current one must be right.
  await page.getByRole('link', { name: 'Change password' }).click();
  await page.getByLabel('Current password', { exact: true }).fill('not my password');
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText("That isn't your current password.")).toBeVisible();
  await page.getByLabel('Current password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(
    page.getByText('Password changed. Your other devices are signed out.'),
  ).toBeVisible();
  await expect(page.getByText(`${email} · verified`)).toBeVisible();

  // Sign out keeps the notes; a wrong password is refused without saying which part was wrong.
  await signOut(page);
  await page.goto('/signin');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('The email or password is wrong.');
  await signIn(page, email, NEW_PASSWORD);
  await signOut(page);

  // Forgotten password: the reset link sets a new one.
  await page.goto('/signin');
  await page.getByRole('link', { name: 'Forgot your password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send a reset link' }).click();
  await expect(
    page.getByText(`If there's an account for ${email}, a link is on its way.`),
  ).toBeVisible();
  const reset = await linkTo(email, '/reset-password');
  await page.goto(reset);
  await page.getByLabel('New password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText(/Password changed\. Every device was signed out/)).toBeVisible();
  await page.getByRole('link', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await signIn(page, email, PASSWORD);

  // A reset link works once.
  await page.goto(reset);
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Set password' }).click();
  await expect(page.getByText('This link has expired or was already used.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Send a new link' })).toBeVisible();

  await page.goto('/');
  await expect(page.getByText('Before the account')).toBeVisible();
});

test('offline, the forms keep what was typed and the notes keep working', async ({
  page,
  context,
}) => {
  // Each screen's code is loaded online first: E2E blocks the service worker that keeps it
  // (offline.spec.ts covers that).
  await page.goto('/');
  await page.getByRole('complementary').getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('link', { name: 'Sign up' }).click();
  await page.getByRole('link', { name: 'Sign in ›' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Email').fill('offline@example.com');
  await context.setOffline(true);
  await expect(
    page.getByText('Needs a connection. Your notes keep working offline.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Email')).toHaveValue('offline@example.com');

  await page.getByRole('link', { name: 'Create one' }).click();
  await expect(page.getByRole('button', { name: 'Create account' })).toBeDisabled();
  await page.getByRole('link', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: 'Lessons' }).click();
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await context.setOffline(false);
});
