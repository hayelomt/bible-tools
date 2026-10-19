import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The M11 gate (PRD v2 milestones H): a sermon is captured live, triaged in the week and traced
// back to its recording. On a phone: the passage is prepped on Saturday; on Sunday capture mode
// opens from the prep card with it pinned, and two sections get their times while a verse is
// shared to the inbox; on Tuesday the share goes to the sermon's lesson, the recording's link is
// added, and a section's ▶ opens the recording at its moment.

const WEPT = 'Jesus wept.';
const RECORDING = 'https://www.youtube.com/watch?v=lazarus1';

const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });
const card = (page: Page) => page.getByRole('region', { name: /^Next sermon/ });
const capture = (page: Page) => page.getByRole('region', { name: 'Sections' });
const notes = (page: Page) => page.locator('[data-section]');

interface Lesson {
  title: string;
  date: string;
  sourceUrl: string | null;
}
interface Section {
  lessonId: string;
  sourceAt: string | null;
}

test.use({ viewport: { width: 390, height: 844 } });

test('a sermon is prepped, captured live, triaged in the week and traced back to its recording', async ({
  page,
}) => {
  // Saturday 24 October 2026, the evening before.
  await page.clock.install({ time: new Date('2026-10-24T19:00:00') });
  await page.goto('/');
  await newLesson(page, 'The Good Shepherd');

  // Prep: the passage announced for tomorrow.
  await page.goto('/');
  await page.getByRole('button', { name: 'Prep the next sermon' }).click();
  const passage = page.getByRole('combobox', { name: 'The next sermon’s passage' });
  await passage.fill('John 11:1-44');
  await passage.press('Enter');
  await expect(card(page).getByRole('heading')).toHaveText('Next sermon · Sun 25 Oct');
  await expect(card(page)).toContainText('Nothing on John 11:1–44 yet. You’ll start fresh.');

  // Sunday, 10:30: capture from the card, the passage pinned. The clock starts as it opens.
  await page.clock.fastForward('15:30:00');
  await page.reload();
  await expect(card(page).getByRole('heading')).toHaveText('Next sermon · Sun 25 Oct');
  await card(page).getByRole('link', { name: 'Start capture' }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole('button', { name: 'John 11:1–44' })).toBeVisible();

  await page.clock.fastForward('02:10');
  await capture(page).getByRole('textbox', { name: 'Section' }).first().click();
  await page.keyboard.type('He waited two days, on purpose.');
  await expect(capture(page)).toContainText('02:10');
  await page.clock.fastForward('07:35');
  await page.getByRole('button', { name: '+ New section' }).click();
  await page.keyboard.type('Jesus wept, though he knew what he would do. ');
  const verseBox = page.getByRole('textbox', { name: 'Verse' });
  await verseBox.fill('jn 11 35');
  await verseBox.press('Enter');
  await expect(capture(page).getByRole('button', { name: /John 11:35/ })).toBeVisible();
  await expect(capture(page)).toContainText('09:45');
  await expect
    .poll(async () => (await rows<Section>(page, 'section')).filter((s) => s.sourceAt).length)
    .toBe(2);

  // Shared to the inbox from a Bible app during the sermon.
  await page.goto(
    `/share?${new URLSearchParams({ text: WEPT, url: 'https://www.bible.com/bible/3034/JHN.11.35.BSB' })}`,
  );
  await expect(page.getByText('John 11:35 · BSB')).toBeVisible();
  await page.getByRole('button', { name: 'Add to inbox' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Inbox');

  // The prep is done: the lesson has its notes.
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Prep the next sermon' })).toBeVisible();
  await expect(card(page)).toBeHidden();

  // Tuesday: the share goes to the sermon's lesson.
  await page.clock.fastForward('48:00:00');
  await page.goto('/inbox');
  const shared = page.getByRole('article', { name: 'John 11:35' });
  await shared.getByRole('button', { name: 'Send to lesson' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
  await expect(toast(page, 'Sent to John 11:1–44.')).toBeVisible();
  await expect(page.getByText('Nothing waiting.')).toBeVisible();

  // The recording's link, posted after the service, goes on the lesson.
  await page.goto('/');
  await page.getByRole('link', { name: /^John 11:1–44/ }).click();
  // The two captured, then the share, then the empty section that's always last.
  await expect(notes(page).nth(0)).toContainText('He waited two days');
  await expect(notes(page).nth(2)).toContainText(WEPT);
  await expect(notes(page)).toHaveCount(4);
  await page.getByRole('button', { name: 'Details' }).click();
  await page.getByRole('radiogroup', { name: 'Source type' }).getByText('Sermon').click();
  await page.getByRole('textbox', { name: 'Source link' }).fill(RECORDING);
  await expect
    .poll(async () => (await rows<Lesson>(page, 'lesson')).find((l) => l.title === 'John 11:1–44'))
    .toMatchObject({ date: '2026-10-25', sourceUrl: RECORDING });

  // ▶ 09:45 opens the recording at that second.
  await page
    .context()
    .route('https://www.youtube.com/**', (route) =>
      route.fulfill({ contentType: 'text/html', body: '<title>Recording</title>' }),
    );
  const moment = notes(page).nth(1).getByRole('link', { name: 'Open the recording at 09:45' });
  await expect(moment).toHaveAttribute('href', `${RECORDING}&t=585`);
  const popup = page.waitForEvent('popup');
  await moment.click();
  expect((await popup).url()).toBe(`${RECORDING}&t=585`);
});
