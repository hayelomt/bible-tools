import { devices, expect, type Page, test } from '@playwright/test';
import { linkTo, newLesson, rows } from './helpers.ts';

// The M3 gate (PRD Milestones B): notes captured offline on one device appear on another, and a
// two-device edit loses nothing. Against the real API: a guest on a laptop captures a lesson
// offline and signs up; a phone signs in and sees it; both edit the same note offline, and the
// note that lost comes back as a conflicted copy on both.

// The laptop is the app as installed, so it can load with no connection.
test.use({ serviceWorkers: 'allow' });

const PASSWORD = 'lamp unto my feet 119';
const TITLE = 'The Good Shepherd';

/** The status line in the sidebar (both browsers are laptop-sized). */
const status = (page: Page) => page.getByRole('complementary').getByRole('status');
const note = (page: Page, n = 0) => page.getByRole('textbox', { name: 'Note', exact: true }).nth(n);
const copy = (page: Page) => page.getByRole('group', { name: /^Conflicted copy · / });

/** Types at the end of the lesson's first note, then leaves it, so it takes pulled changes. */
async function addToNote(page: Page, text: string) {
  await note(page).click();
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await page.keyboard.press('Escape');
  await expect(note(page)).not.toBeFocused();
}

/** "Sync now" from the sync panel, which is then closed. */
async function syncNow(page: Page) {
  await page
    .getByRole('complementary')
    .getByRole('button', { name: /^Sync:/ })
    .click();
  await page
    .getByRole('dialog', { name: 'Sync' })
    .getByRole('button', { name: 'Sync now' })
    .click();
  await expect(status(page)).toHaveText('Synced');
  await page.keyboard.press('Escape');
}

test('a lesson captured offline as a guest reaches a second device, and a two-device edit loses nothing', async ({
  page: laptop,
  context: laptopContext,
  browser,
  baseURL,
}) => {
  // New for each attempt: sign-ups to one address are limited (10 in 15 minutes).
  const email = `gate-sync.${Date.now().toString(36)}@example.com`;

  // A guest at church: installed on an earlier visit, now with no connection.
  await laptop.goto('/');
  await laptop.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await laptopContext.setOffline(true);
  await laptop.reload();
  await expect(status(laptop)).toHaveText('On this device');
  await newLesson(laptop, TITLE);
  await laptop.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(laptop)).toBeFocused();
  await laptop.keyboard.type('Jesus is the door');
  await laptop.keyboard.press('Escape');
  await expect.poll(async () => (await rows(laptop, 'section')).length).toBe(1);

  // Home again, the guest signs up and verifies; the notes join the account.
  await laptopContext.setOffline(false);
  await laptop.goto('/signup');
  await laptop.getByLabel('Email').fill(email);
  await laptop.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await laptop.getByRole('button', { name: 'Create account' }).click();
  await expect(laptop.getByRole('heading', { name: 'Check your email' })).toBeVisible();
  await laptop.goto(await linkTo(email, '/verify-email'));
  await expect(laptop.getByText('Email verified.')).toBeVisible();
  await laptop.goto('/');
  await expect(status(laptop)).toHaveText('Synced');

  // A second browser with an iPhone's user agent, so the device has another name. A new context
  // takes none of the config's `use`, so it's given here.
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

  // The phone signs in and the lesson is there, note and all.
  await phone.goto('/signin');
  await phone.getByLabel('Email').fill(email);
  await phone.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(phone.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await phone.goto('/');
  await expect(status(phone)).toHaveText('Synced');
  await phone.getByRole('link', { name: new RegExp(TITLE) }).click();
  await expect(note(phone)).toHaveText('Jesus is the door');

  // Both lose the connection and add to the same note, the phone last.
  await laptop.getByRole('link', { name: new RegExp(TITLE) }).click();
  await laptopContext.setOffline(true);
  await phoneContext.setOffline(true);
  await addToNote(laptop, ' of the sheep');
  await expect(status(laptop)).toHaveText(/^Offline · \d+ waiting$/);
  await addToNote(phone, ' and the good shepherd');
  await expect(status(phone)).toHaveText(/^Offline · \d+ waiting$/);

  // Back online, the laptop syncs first, then the phone: the phone's newer note stays, and the
  // laptop's comes back beside it as a copy, named for the laptop.
  await laptopContext.setOffline(false);
  await expect(status(laptop)).toHaveText('Synced');
  await phoneContext.setOffline(false);
  await expect(status(phone)).toHaveText('Synced');
  await syncNow(laptop);

  for (const page of [laptop, phone]) {
    await expect(note(page)).toHaveText('Jesus is the door and the good shepherd');
    await expect(copy(page)).toHaveCount(1);
    await expect(copy(page)).toHaveAccessibleName(/^Conflicted copy · Chrome on Windows · /);
    await expect(copy(page).getByRole('textbox', { name: 'Note' })).toHaveText(
      'Jesus is the door of the sheep',
    );
    await page.getByRole('link', { name: 'Lessons' }).first().click();
    await expect(page.getByText('1 conflicted copy')).toBeVisible();
  }

  await phoneContext.close();
});
