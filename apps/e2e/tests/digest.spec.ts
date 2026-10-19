import { readFile } from 'node:fs/promises';
import {
  citationsFor,
  ENTITY_SCHEMAS,
  type EntityRow,
  keysBetween,
  lastQuarter,
  newId,
  parseReference,
} from '@lamp/domain';
import { expect, type Page, test } from '@playwright/test';
import { rows, type Seed, writeRows } from './helpers.ts';
import { localToday, twoYearsOfNotes } from './two-years.ts';

// The quarterly digest (F32, M12-07, M12-08): on the first open after a quarter ends, a draft of
// what it held, to edit and keep as a lesson tagged "digest". On two years of notes it's drafted,
// and opens, within its budget on a mid-range phone (M12-11).

test.use({ viewport: { width: 390, height: 844 } });

/** Two years of notes on a mid-range phone (TECH-DESIGN §14, decided in M12-11). */
const BUDGET_MS = 200;
/** Monday 19 October 2026: July–September has ended. */
const TODAY = new Date('2026-10-19T09:00:00');
const NOW = TODAY.toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

const chip = (reference: string) => {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref };
};

const QUESTION = 'Who are the other sheep?';

/** A quarter: two lessons in John, one on its own, grace twice and a question still open. */
function aQuarter(tagIds: Map<string, string>): Seed {
  const series = ENTITY_SCHEMAS.series.parse({
    ...synced(),
    title: 'John',
    description: '',
    kind: 'book_study',
  });
  const seed = {
    series: [series],
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
    sectionTag: [] as EntityRow<'sectionTag'>[],
    question: [] as EntityRow<'question'>[],
    questionEntry: [] as EntityRow<'questionEntry'>[],
  };
  for (const [title, date, seriesId, reference] of [
    ['The Word became flesh', '2026-07-05', series.id, 'Jn 1:14'],
    ['The Good Shepherd', '2026-08-02', series.id, 'Jn 10:11'],
    ['Be still', '2026-09-13', null, 'Ps 46:10'],
  ] as const) {
    const lesson = ENTITY_SCHEMAS.lesson.parse({
      ...synced(),
      seriesId,
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
      mainPassages: [],
    });
    seed.lesson.push(lesson);
    const section = ENTITY_SCHEMAS.section.parse({
      ...synced(),
      lessonId: lesson.id,
      parentId: null,
      orderKey: keysBetween(null, null, 1)[0],
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
    });
    seed.section.push(section);
    if (seriesId) {
      seed.sectionTag.push(
        ENTITY_SCHEMAS.sectionTag.parse({
          ...synced(),
          tagId: tagIds.get('grace')!,
          sectionId: section.id,
        }),
      );
    }
    if (title === 'The Good Shepherd') {
      const question = ENTITY_SCHEMAS.question.parse({
        ...synced(),
        lessonId: lesson.id,
        text: QUESTION,
        splitFromId: null,
      });
      seed.question.push(question);
      seed.questionEntry.push(
        ENTITY_SCHEMAS.questionEntry.parse({
          ...synced(),
          questionId: question.id,
          lessonId: lesson.id,
          kind: 'asked',
          sectionId: null,
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

const card = (page: Page) => page.getByRole('region', { name: 'Digest' });
const notes = (page: Page) => page.getByRole('textbox', { name: 'Note', exact: true });

test('the last quarter is drafted once, edited, exported and kept as a lesson', async ({
  page,
}) => {
  await page.clock.install({ time: TODAY });
  await writeRows(page, aQuarter(await seededTags(page)));
  await page.reload();

  await expect(card(page)).toContainText('Your July–September digest is ready to look over.');
  await expect(card(page).getByRole('button', { name: 'Not now' })).toBeVisible();
  await card(page).getByRole('link', { name: 'Open draft' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Digest draft');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('July–September 2026');
  await expect(page.getByText('Draft · not in your lessons yet')).toBeVisible();
  await expect(notes(page)).toHaveCount(6);
  await expect(notes(page).nth(0)).toContainText('3 lessons: 2 in John, 1 on its own.');
  await expect(notes(page).nth(0)).toContainText('The Good Shepherd');
  await expect(notes(page).nth(1)).toContainText('grace');
  await expect(notes(page).nth(2)).toContainText(QUESTION);

  // Written in like a lesson, and exported before it's kept.
  await notes(page).last().click();
  await page.keyboard.type('A quarter in John.');
  await page.getByRole('textbox', { name: 'Title' }).fill('Summer in John');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'digestDraft')))
    .toContain('A quarter in John.');
  await page.getByRole('button', { name: 'Digest draft actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  const downloading = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Export “Summer in John”' })
    .getByRole('button', { name: 'Markdown file (.md)' })
    .click();
  const markdown = await readFile((await (await downloading).path())!, 'utf8');
  expect(markdown).toMatch(
    /^# Summer in John\n\nWednesday 30 September 2026 · Personal\\\n#digest\n\n/,
  );
  expect(markdown).toContain('A quarter in John.');

  // Kept: a lesson on the quarter's last day, tagged digest, and the card is gone for good.
  await page.getByRole('button', { name: 'Keep as a lesson' }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'Summer in John',
  );
  const lessons = await rows<{ title: string; date: string; kind: string }>(page, 'lesson');
  expect(lessons.find((l) => l.title === 'Summer in John')).toMatchObject({
    date: '2026-09-30',
    kind: 'personal',
  });
  await expect(page.getByRole('main')).toContainText('A quarter in John.');
  // The chapters that grew link to their commentaries, without the chapters' text.
  await expect(page.getByRole('link', { name: 'John 10' })).toHaveAttribute(
    'href',
    /\/compile\/JHN\.10$/,
  );
  await expect(page.getByRole('main')).not.toContainText('Truly, truly');
  const tags = await rows<{ id: string; name: string }>(page, 'tag');
  const digestTag = tags.find((t) => t.name === 'digest')!;
  expect(await rows(page, 'lessonTag')).toEqual([
    expect.objectContaining({ tagId: digestTag.id, deletedAt: null }),
  ]);
  const kept = page.url();
  await page.getByRole('link', { name: 'John 10' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commentary');
  await expect(page).toHaveURL(/\/compile\/JHN\.10$/);
  await page.goto(kept);
  expect(await rows(page, 'digestDraft')).toEqual([]);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: /Summer in John/ })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

/** Puts the device back to before the draft, so the next open drafts it again. */
async function undraft(page: Page) {
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lamp');
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const tx = db.transaction(['digestDraft', 'userSettings'], 'readwrite');
    tx.objectStore('digestDraft').clear();
    const cursor = tx.objectStore('userSettings').openCursor('settings');
    cursor.addEventListener('success', () => {
      const row = cursor.result;
      row?.update({ ...row.value, lastDigestQuarter: null });
    });
    await new Promise((resolve, reject) => {
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
    db.close();
  });
}

async function mark(page: Page, name: string): Promise<number> {
  const ready = await page.waitForFunction(
    (entry) =>
      (performance.getEntriesByName(entry)[0] as PerformanceMark | undefined)?.detail ?? null,
    name,
    { timeout: 30_000 },
  );
  return ((await ready.jsonValue()) as { ms: number }).ms;
}

const median = (times: number[]) => times.toSorted((a, b) => a - b)[1]!;

test('two years of notes are drafted and opened within the two-years budget on a mid-range phone', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 360, height: 760 });
  const notesSeed = twoYearsOfNotes(await seededTags(page));
  await writeRows(page, notesSeed.seed);
  await undraft(page);
  const cdp = await page.context().newCDPSession(page);
  // Chrome slowed four times: the usual stand-in for a mid-range phone, which the budget is for
  // (a low-end phone's 6× is in the README).
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  // The median of three drafts, each on a fresh open.
  const drafted: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto('/');
    drafted.push(await mark(page, 'lamp:digest-ready'));
    await expect(card(page)).toBeVisible();
    if (i < 2) await undraft(page);
  }
  const opened: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto(`/digest/${lastQuarter(localToday())}`);
    opened.push(await mark(page, 'lamp:digest-draft-ready'));
    await expect(notes(page)).toHaveCount(6);
  }
  const line = (times: number[]) =>
    `${times.map(Math.round).join(', ')} ms (median ${Math.round(median(times))})`;
  console.log(
    `Digest: ${notesSeed.lessons} lessons, ${notesSeed.sections} sections; drafted in ${line(drafted)}; opened in ${line(opened)}`,
  );
  expect(median(drafted)).toBeLessThan(BUDGET_MS);
  expect(median(opened)).toBeLessThan(BUDGET_MS);
});
