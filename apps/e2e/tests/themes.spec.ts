import {
  citationsFor,
  ENTITY_SCHEMAS,
  type EntityRow,
  keysBetween,
  newId,
  parseReference,
} from '@lamp/domain';
import { expect, type Page, test } from '@playwright/test';
import { rows, type Seed, writeRows } from './helpers.ts';
import { twoYearsOfNotes } from './two-years.ts';

// The theme map (F31, M12-03, M12-04): tags against months and books as heat grids. Its colours
// come from the theme's heat tokens in light and dark, and every count is in a name (M12-10); on
// two years of notes it draws within its budget on a mid-range phone (M12-11).

/** Two years of notes on a mid-range phone (TECH-DESIGN §14, decided in M12-11). */
const BUDGET_MS = 200;
const TODAY = new Date('2026-10-19T09:00:00');
const NOW = TODAY.toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

const chip = (reference: string) => {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref };
};

/** Grace three times in March on Romans and once in October on John; hope on a whole lesson. */
function fewNotes(tagIds: Map<string, string>): Seed {
  const seed = {
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
    sectionTag: [] as EntityRow<'sectionTag'>[],
    lessonTag: [] as EntityRow<'lessonTag'>[],
  };
  for (const [title, date, references] of [
    ['More than conquerors', '2026-03-01', ['Rom 8:28', 'Rom 8:31', 'Rom 8:37']],
    ['The Good Shepherd', '2026-10-11', ['Jn 10:11']],
  ] as const) {
    const lesson = ENTITY_SCHEMAS.lesson.parse({
      ...synced(),
      seriesId: null,
      title,
      date,
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      groupLessonId: null,
      mainPassages: [],
    });
    seed.lesson.push(lesson);
    const keys = keysBetween(null, null, references.length);
    references.forEach((reference, i) => {
      const section = ENTITY_SCHEMAS.section.parse({
        ...synced(),
        lessonId: lesson.id,
        parentId: null,
        orderKey: keys[i],
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'On ' },
                { type: 'verse', attrs: chip(reference) },
              ],
            },
          ],
        },
        conflictOf: null,
        conflictDevice: null,
        sourceAt: null,
        sourcePage: null,
        visibility: 'private',
        groupId: null,
        sharedAt: null,
        replyToId: null,
        answersQuestionId: null,
        answerKind: null,
      });
      seed.section.push(section);
      seed.sectionTag.push(
        ENTITY_SCHEMAS.sectionTag.parse({
          ...synced(),
          tagId: tagIds.get('grace')!,
          sectionId: section.id,
        }),
      );
    });
    if (date.startsWith('2026-10')) {
      seed.lessonTag.push(
        ENTITY_SCHEMAS.lessonTag.parse({
          ...synced(),
          tagId: tagIds.get('hope')!,
          lessonId: lesson.id,
        }),
      );
    }
  }
  const citation = seed.section
    .flatMap((row) => citationsFor('section', row))
    .map((entry) => ({ id: newId(), ...entry }));
  return { ...seed, citation };
}

/** The device's seeded tags, by name, after the first start. */
async function seededTags(page: Page): Promise<Map<string, string>> {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  const tags = await rows<{ id: string; name: string }>(page, 'tag');
  return new Map(tags.map((t) => [t.name, t.id]));
}

/** A cell's colour, and the heat token's, as the page computes them now. */
function colours(page: Page, cell: string, token: string) {
  return page.evaluate(
    ([name, variable]) => {
      const link = document.querySelector(`a[aria-label="${name}"]`)!;
      const probe = document.createElement('div');
      probe.style.background = `var(${variable})`;
      document.body.append(probe);
      const expected = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        cell: getComputedStyle(link.querySelector('span')!).backgroundColor,
        token: expected,
      };
    },
    [cell, token],
  );
}

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the grid is a table whose cells name their counts, in the heat colours of each mode', async ({
    page,
  }) => {
    await page.clock.install({ time: TODAY });
    await page.emulateMedia({ colorScheme: 'light' });
    await writeRows(page, fewNotes(await seededTags(page)));
    await page.goto('/themes');

    const grid = page.getByRole('table', { name: 'Tags by month: notes in each' });
    await expect(grid.getByRole('rowheader')).toHaveText(['grace', 'hope']);
    await expect(grid.getByRole('link', { name: 'grace, March 2026, 3 notes' })).toBeVisible();
    await expect(grid.getByRole('link', { name: 'grace, October 2026, 1 note' })).toBeVisible();
    await expect(grid.getByRole('link', { name: 'hope, October 2026, 1 note' })).toBeVisible();
    // A month with none says so, though it's no link.
    await expect(grid.getByText('grace, April 2026, no notes')).toBeAttached();
    await expect(page.getByRole('list', { name: 'Scale' })).toHaveText(/none.*1–2.*3–5.*6–9.*10\+/);

    // Three notes are the second step; in dark mode the same step has its own colour.
    const light = await colours(page, 'grace, March 2026, 3 notes', '--heat-2');
    expect(light.cell).toBe(light.token);
    await page.emulateMedia({ colorScheme: 'dark' });
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const dark = await colours(page, 'grace, March 2026, 3 notes', '--heat-2');
    expect(dark.cell).toBe(dark.token);
    expect(dark.cell).not.toBe(light.cell);
    const one = await colours(page, 'grace, October 2026, 1 note', '--heat-1');
    expect(one.cell).toBe(one.token);

    // By book: Romans and John, and a cell opens the tag's notes on that book.
    await page.getByRole('radio', { name: 'By book' }).check();
    const books = page.getByRole('table', { name: 'Tags by book: notes in each' });
    await expect(books.getByRole('link', { name: 'grace, Romans, 3 notes' })).toBeVisible();
    await expect(books.getByRole('link', { name: 'grace, John, 1 note' })).toBeVisible();
    await expect(books.getByText('grace, Genesis, no notes')).toBeAttached();
    await books.getByRole('link', { name: 'grace, Romans, 3 notes' }).click();
    await expect(page).toHaveURL(/\/tags\/[\w-]+\?book=ROM$/);
  });
});

test('on a phone each row is a link with its count', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 760 });
  await page.clock.install({ time: TODAY });
  await writeRows(page, fewNotes(await seededTags(page)));
  await page.goto('/themes');
  await expect(page.getByRole('main').getByRole('link')).toHaveText(['grace', 'hope']);
  await expect(
    page.getByRole('link', { name: 'grace: 4 notes in the last 24 months' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'hope: 1 note in the last 24 months' }),
  ).toBeVisible();
  // Nothing scrolls sideways at 360 px.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});

/** The median of three opens of `address`, on a phone (the CPU slowed by the test). */
async function timeOpens(page: Page, address: string): Promise<{ times: number[]; items: number }> {
  const times: number[] = [];
  let items = 0;
  for (let i = 0; i < 3; i++) {
    await page.goto(address);
    const ready = await page.waitForFunction(
      () =>
        (performance.getEntriesByName('lamp:theme-map-ready')[0] as PerformanceMark | undefined)
          ?.detail ?? null,
      undefined,
      { timeout: 30_000 },
    );
    const detail = (await ready.jsonValue()) as { ms: number; items: number };
    times.push(detail.ms);
    items = detail.items;
  }
  return { times, items };
}

const median = (times: number[]) => times.toSorted((a, b) => a - b)[1]!;

test('two years of notes draw within the two-years budget on a mid-range phone', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 760 });
  const notes = twoYearsOfNotes(await seededTags(page));
  await writeRows(page, notes.seed);
  const cdp = await page.context().newCDPSession(page);
  // Chrome slowed four times: the usual stand-in for a mid-range phone, which the budget is for
  // (a low-end phone's 6× is in the README).
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  for (const [view, address] of [
    ['by month', '/themes'],
    ['by book', '/themes?view=book'],
  ] as const) {
    const { times, items } = await timeOpens(page, address);
    expect(items).toBe(notes.tagged);
    console.log(
      `Theme map ${view}: ${notes.lessons} lessons, ${notes.sections} sections, ${items} tagged, drawn in ${times.map(Math.round).join(', ')} ms (median ${Math.round(median(times))})`,
    );
    expect(median(times)).toBeLessThan(BUDGET_MS);
    await expect(page.getByRole('main').getByRole('link').first()).toBeVisible();
  }
});
