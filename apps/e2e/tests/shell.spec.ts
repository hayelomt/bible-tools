import { expect, type Page, test } from '@playwright/test';

const SCREENS = [
  ['/', 'Lessons'],
  ['/inbox', 'Inbox'],
  ['/read', 'John 1'],
  ['/search', 'Search'],
  ['/review', 'Review'],
  ['/settings', 'Settings'],
  ['/signup', 'Create an account'],
  ['/signin', 'Sign in'],
  ['/forgot-password', 'Reset your password'],
  ['/check-email', 'Check your email'],
  ['/verify-email', 'Verify your email'],
  ['/reset-password', 'Choose a new password'],
  ['/settings/password', 'Change password'],
] as const;

const sidewaysScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

for (const { name, viewport } of [
  { name: 'phone', viewport: { width: 360, height: 740 } },
  { name: 'laptop', viewport: { width: 1280, height: 800 } },
]) {
  test.describe(`on a ${name}`, () => {
    test.use({ viewport });

    test('every screen renders, with no sideways scroll', async ({ page }) => {
      for (const [path, title] of SCREENS) {
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        expect(await sidewaysScroll(page)).toBe(0);
      }
    });
  });
}

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 } });

  test('the bottom bar moves between destinations, and the sidebar is hidden', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('complementary')).toBeHidden();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Lessons' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await nav.getByRole('link', { name: 'Read' }).click();
    await expect(page).toHaveURL(/\/read\/JHN\.1$/);
    await expect(nav.getByRole('link', { name: 'Read' })).toHaveAttribute('aria-current', 'page');
    await expect(nav.getByRole('link', { name: 'Lessons' })).not.toHaveAttribute('aria-current');

    await page.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
  });
});

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the sidebar holds the destinations, the sync status and settings', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('status')).toHaveText('On this device');
    await sidebar.getByRole('link', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Review');
    await sidebar.getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Settings');
  });

  test('"/" opens search', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
    await page.keyboard.press('/');
    await expect(page).toHaveURL(/\/search$/);
  });
});

test('a guest is never asked to sign in', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Your notes are only on this device.')).toBeVisible();
  await expect(page.getByRole('button', { name: /sign (in|up)/i })).toHaveCount(0);
});

test('settings show the server status through the /api proxy', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText(/^Server ok · v\d+\.\d+\.\d+/)).toBeVisible();
});

test('an unknown address keeps the navigation', async ({ page }) => {
  await page.goto('/no-such-screen');
  await expect(page.getByText("There's nothing at this address.")).toBeVisible();
  await page.getByRole('link', { name: 'Go to lessons' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Lessons');
});
