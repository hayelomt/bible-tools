import { devices, expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson, rows } from './helpers.ts';

// Devices (wireframes/account.md, TECH-DESIGN §6.6) against the real API: a laptop and a phone
// sync with one account; the laptop signs the phone out, and the phone keeps its notes.

const RUN = Date.now().toString(36);
const PASSWORD = 'lamp unto my feet 119';

/** The status line in the sidebar (both browsers are laptop-sized). */
const status = (page: Page) => page.getByRole('complementary').getByRole('status');

test('a device signed out from another gets 401 and keeps its notes', async ({
  page: laptop,
  context: laptopContext,
  browser,
  baseURL,
}) => {
  const email = `devices.${RUN}@example.com`;
  // A second browser, laptop-sized like the first but with an iPhone's user agent, so the device
  // is named differently. A new context takes none of the config's `use`, so it's given here.
  const phoneContext = await browser.newContext({
    baseURL,
    userAgent: devices['iPhone 13'].userAgent,
    serviceWorkers: 'block',
    storageState: {
      cookies: [],
      origins: [{ origin: baseURL!, localStorage: [{ name: 'lamp.welcomed', value: 'e2e' }] }],
    },
  });
  const phone = await phoneContext.newPage();

  // The laptop signs up and verifies; it is listed from its first sync.
  await laptop.goto('/signup');
  await laptop.getByLabel('Email').fill(email);
  await laptop.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await laptop.getByRole('button', { name: 'Create account' }).click();
  await expect(laptop.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await laptop.goto(await linkTo(email, '/verify-email'));
  await expect(laptop.getByText('Email verified.')).toBeVisible();
  await laptop.goto('/');
  await expect(status(laptop)).toHaveText('Synced');

  // The phone signs in and writes a lesson, which syncs.
  await phone.goto('/signin');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(phone.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await phone.goto('/');
  await newLesson(phone, 'Written on the phone');
  await phone.goto('/');
  await expect(status(phone)).toHaveText('Synced');

  // Settings counts both; the list puts this device first.
  await laptop.goto('/settings');
  await laptop.getByRole('link', { name: 'Devices · 2 devices ›' }).click();
  await expect(laptop.getByRole('heading', { name: 'Devices' })).toBeVisible();
  const list = laptop.getByRole('main').getByRole('listitem');
  await expect(list).toHaveCount(2);
  await expect(list.first()).toHaveAccessibleName(/^This device: Chrome on /);
  await expect(list.first().getByRole('button', { name: 'Sign out' })).toHaveCount(0);
  const phoneRow = laptop.getByRole('main').getByRole('listitem', { name: 'Safari on iOS' });
  await expect(phoneRow.getByText(/^Last synced just now · Lamp \d+\.\d+\.\d+$/)).toBeVisible();

  // Offline, the last copy stays.
  await laptopContext.setOffline(true);
  await expect(laptop.getByText('Needs a connection to update.')).toBeVisible();
  await expect(list).toHaveCount(2);
  await expect(phoneRow.getByRole('button', { name: 'Sign out' })).toBeDisabled();
  await laptopContext.setOffline(false);

  // Signing the phone out asks first.
  await phoneRow.getByRole('button', { name: 'Sign out' }).click();
  const dialog = laptop.getByRole('dialog', { name: 'Sign out Safari on iOS?' });
  await expect(
    dialog.getByText(
      'Its notes stay on it, and it stops syncing until someone signs in there again.',
    ),
  ).toBeVisible();
  await dialog.getByRole('button', { name: 'Sign out' }).click();
  await expect(laptop.getByText('Safari on iOS is signed out.')).toBeVisible();
  await expect(list).toHaveCount(1);

  // The phone's next sync gets 401: it asks to sign in, and its notes stay.
  const unauthorized = phone.waitForResponse(
    (res) => res.url().includes('/api/sync/') && res.status() === 401,
  );
  await phone
    .getByRole('complementary')
    .getByRole('button', { name: /^Sync:/ })
    .click();
  await phone
    .getByRole('dialog', { name: 'Sync' })
    .getByRole('button', { name: 'Sync now' })
    .click();
  await unauthorized;
  await expect(status(phone)).toHaveText('Sign in to sync');
  await phone.keyboard.press('Escape');
  await expect(phone.getByRole('link', { name: /Written on the phone/ })).toBeVisible();
  expect((await rows<{ title: string }>(phone, 'lesson')).map((l) => l.title)).toEqual([
    'Written on the phone',
  ]);

  await phoneContext.close();
});
