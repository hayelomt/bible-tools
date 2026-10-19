import { ENTITY_SCHEMAS, type EntityRow, keysBetween, newId } from '@lamp/domain';
import { expect, type Page, test } from '@playwright/test';
import { type Seed, writeRows } from './helpers.ts';

// The handout (F33, M12-05): a lesson with ten sections prints on one A4 page and one Letter page.
// Chromium prints it to PDF and counts the pages; Firefox, which Playwright can't print to PDF,
// lays it out for print and measures it. Safari is checked by hand (MANUAL-TESTS.md).

const NOW = new Date().toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

const HEADINGS = [
  'Jesus is the door of the sheepfold, and the only way in',
  'The thief comes to steal and kill and destroy',
  'The hired hand runs when the wolf comes',
  'He knows his own and his own know him',
  'Other sheep, not of this fold',
  'One flock, one shepherd',
  'He lays down his life of his own accord',
  'Authority to take it up again',
  'The Jews were divided again',
  'Can a demon open the eyes of the blind?',
];

const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
});

/** "The Good Shepherd": John 10:1–18, ten sections of two paragraphs, takeaways and questions. */
function goodShepherd(): { seed: Seed; lessonId: string } {
  const lesson = ENTITY_SCHEMAS.lesson.parse({
    ...synced(),
    seriesId: null,
    title: 'The Good Shepherd',
    date: '2026-10-11',
    kind: 'sermon',
    speaker: 'Pastor Ann',
    church: 'Grace Chapel',
    sourceType: 'sermon',
    sourceTitle: 'Sunday service',
    sourceAuthor: null,
    sourceUrl: 'https://www.youtube.com/watch?v=abc123',
    sourceStartedAt: null,
    mainPassages: [
      {
        book: 'JHN',
        chapter: 10,
        verseStart: 1,
        verseEnd: 18,
        display: 'John 10:1–18',
        translation: 'BSB',
      },
    ],
  });
  const keys = keysBetween(null, null, HEADINGS.length);
  const section: EntityRow<'section'>[] = HEADINGS.map((heading, i) =>
    ENTITY_SCHEMAS.section.parse({
      ...synced(),
      lessonId: lesson.id,
      parentId: null,
      orderKey: keys[i],
      body: {
        type: 'doc',
        content: [paragraph(heading), paragraph('More on it, which the handout leaves out.')],
      },
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    }),
  );
  const takeaway = ['He knows his sheep by name.', 'The door is a person, not a rule.'].map(
    (text) => ENTITY_SCHEMAS.takeaway.parse({ ...synced(), lessonId: lesson.id, text }),
  );
  const question = ['Who are the “other sheep”?', 'What is the door?'].map((text) =>
    ENTITY_SCHEMAS.question.parse({ ...synced(), lessonId: lesson.id, text, splitFromId: null }),
  );
  return { seed: { lesson: [lesson], section, takeaway, question }, lessonId: lesson.id };
}

/** Counts the print dialogs asked for, instead of opening them. */
async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { prints: number }).prints = 0;
    window.print = () => void (window as unknown as { prints: number }).prints++;
  });
}

const prints = (page: Page) =>
  page.evaluate(() => (window as unknown as { prints: number }).prints);

/** What A4 and Letter both hold inside the print margins (`print.css`: 18 mm by 16 mm), in px. */
const MM = 96 / 25.4;
const PAGE_AREA = { width: (210 - 32) * MM, height: (279.4 - 36) * MM };

test('a lesson with ten sections prints as a handout on one A4 page and one Letter page', async ({
  page,
  browserName,
}) => {
  await stubPrint(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  const { seed, lessonId } = goodShepherd();
  await writeRows(page, seed);

  await page.goto(`/lessons/${lessonId}`);
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await page
    .getByRole('dialog', { name: 'Export “The Good Shepherd”' })
    .getByRole('button', { name: 'Handout (one page)' })
    .click();

  // The print dialog opens once the passage's text is in and the page is fitted.
  await expect(page).toHaveURL((url) => url.pathname === `/lessons/${lessonId}/handout`);
  await expect.poll(() => prints(page)).toBe(1);
  const handout = page.getByTestId('handout');
  await expect(handout.getByRole('heading', { level: 1 })).toHaveText('The Good Shepherd');
  await expect(handout).toContainText('Sunday 11 October 2026 · Sermon · Pastor Ann, Grace Chapel');
  await expect(handout).toContainText('Sermon: Sunday service (youtube.com)');
  await expect(handout).toContainText('John 10:1–18 (BSB)');
  await expect(handout).toContainText('Truly, truly, I tell you');
  await expect(handout.getByRole('listitem')).toHaveCount(10 + 2 + 2);
  await expect(handout).toContainText('Scripture: Berean Standard Bible (public domain).');
  await expect(page.getByText(/Too long for one page/)).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Print' })).toBeHidden();
  const size = await handout.evaluate((el) => ({
    width: el.getBoundingClientRect().width,
    height: el.getBoundingClientRect().height,
    content: el.scrollHeight,
    top: el.getBoundingClientRect().top + window.scrollY,
  }));
  // Nothing runs out of the box, and the box is inside the page's margins from its top.
  expect(size.content).toBeLessThanOrEqual(Math.ceil(size.height));
  expect(size.width).toBeLessThanOrEqual(PAGE_AREA.width);
  expect(size.top + size.height).toBeLessThanOrEqual(PAGE_AREA.height);

  if (browserName === 'chromium') {
    for (const format of ['A4', 'Letter'] as const) {
      const pdf = await page.pdf({ format });
      const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
      expect({ format, pages: pages.length }).toEqual({ format, pages: 1 });
    }
  }
});

test('a lesson too long for one page leaves note headings out and says so', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  const { seed, lessonId } = goodShepherd();
  const [first] = seed.section as EntityRow<'section'>[];
  const keys = keysBetween(null, null, 90);
  seed.section = keys.map((orderKey, i) => ({
    ...first!,
    ...synced(),
    orderKey,
    body: {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: `Point ${i + 1}` }] }],
    },
  }));
  await writeRows(page, seed);

  await page.goto(`/lessons/${lessonId}/handout`);
  await expect(
    page.getByText(/^Too long for one page: \d+ note headings left out\.$/),
  ).toBeVisible();
  const handout = page.getByTestId('handout');
  await expect(handout).not.toContainText('Point 90');
  await expect(handout).toContainText('Point 1');
  // The passage is its reference alone, and the questions are all there.
  await expect(handout).not.toContainText('Truly, truly');
  await expect(handout).toContainText('What is the door?');
});
