import { expect, test } from '@playwright/test';

// The weekly reminder (F9, M6-04): Periodic Background Sync in Chromium for an installed app, and
// otherwise a line saying the Review tab's count stands in. Playwright can't install the app, and
// firing the browser's periodic sync from DevTools crashes headless Chromium, so the reminder
// itself is covered by `data/reminder.test.ts`, `lib/reminder.test.ts` and MANUAL-TESTS.md.

test('a browser that can’t remind says the Review tab’s count stands in', async ({ page }) => {
  // Other specs block the service worker, as a browser without one would be.
  await page.goto('/settings');
  const review = page.getByRole('region', { name: 'Review' });
  await expect(review).toContainText(
    'This browser can’t send reminders. The Review tab shows a count instead.',
  );
  // No reminder switch; the resurfacing rules' switches (M12-01) are still there.
  await expect(review.getByRole('switch', { name: /Weekly reminder/ })).toHaveCount(0);
  await expect(review.getByRole('switch')).toHaveCount(3);
});

test.describe('with the service worker, in a tab', () => {
  test.use({ serviceWorkers: 'allow' });

  test('a tab (not an installed app) degrades the same way', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.goto('/settings');
    await expect(page.getByRole('region', { name: 'Review' })).toContainText(
      'This browser can’t send reminders.',
    );
  });
});
