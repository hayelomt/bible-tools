import {
  citationsFor,
  DEFAULT_TRANSLATION,
  ENTITY_SCHEMAS,
  type EntityRow,
  keysBetween,
  newId,
  parseReference,
  type SectionBody,
} from '@lamp/domain';
import { expect, type Page, test } from '@playwright/test';
import { rows, type Seed, writeRows } from './helpers.ts';

// The prep card (F29, M11-09): the coming sermon's passage on the lessons home, what Lamp already
// has on it, and a draft lesson that capture mode opens with the passage pinned.

const NOW = new Date().toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

function verseRef(reference: string) {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref, translation: DEFAULT_TRANSLATION };
}

/** A note's text as a section body, with `{John 11:35}` for a verse chip. */
function noteBody(note: string): SectionBody {
  const content = note
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{')
        ? { type: 'verse' as const, attrs: verseRef(part.slice(1, -1)) }
        : { type: 'text' as const, text: part },
    );
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

const lessonRow = (title: string, date: string, passages: string[], seriesId: string | null) =>
  ENTITY_SCHEMAS.lesson.parse({
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
    mainPassages: passages.map(verseRef),
  });

/**
 * A lesson on John 11 from last year, with two notes on it, a tag and a question; and the series
 * John, whose last lesson was on John 10 a week ago.
 */
function seed(): Seed {
  const series = ENTITY_SCHEMAS.series.parse({
    ...synced(),
    title: 'John',
    description: '',
    kind: 'sermon_series',
  });
  const shepherd = lessonRow('The Good Shepherd', '2026-10-11', ['John 10:1-18'], series.id);
  const lazarus = lessonRow('Lazarus', '2025-03-02', ['John 11'], null);
  const keys = keysBetween(null, null, 2);
  const section: EntityRow<'section'>[] = [
    'Jesus wept, knowing what he would do. {John 11:35}',
    'He calls the dead by name. {John 11:43}',
  ].map((note, i) =>
    ENTITY_SCHEMAS.section.parse({
      ...synced(),
      lessonId: lazarus.id,
      parentId: null,
      orderKey: keys[i]!,
      body: noteBody(note),
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    }),
  );
  const tag = ENTITY_SCHEMAS.tag.parse({ ...synced(), name: 'bethany', isSeeded: false });
  const question = ENTITY_SCHEMAS.question.parse({
    ...synced(),
    lessonId: lazarus.id,
    text: 'Why did Jesus wait two days?',
    splitFromId: null,
  });
  const lessons = [shepherd, lazarus];
  return {
    series: [series],
    lesson: lessons,
    section,
    tag: [tag],
    sectionTag: [
      ENTITY_SCHEMAS.sectionTag.parse({ ...synced(), tagId: tag.id, sectionId: section[0]!.id }),
    ],
    question: [question],
    questionEntry: [
      ENTITY_SCHEMAS.questionEntry.parse({
        ...synced(),
        questionId: question.id,
        lessonId: lazarus.id,
        kind: 'asked',
        sectionId: null,
      }),
    ],
    citation: [
      ...section.flatMap((row) => citationsFor('section', row)),
      ...lessons.flatMap((row) => citationsFor('lesson', row)),
    ].map((entry) => ({ id: newId(), ...entry })),
  };
}

interface Lesson {
  id: string;
  title: string;
  date: string;
  seriesId: string | null;
  mainPassages: { display: string }[];
}

const card = (page: Page) => page.getByRole('region', { name: /^Next sermon/ });
const toast = (page: Page, text: string) =>
  page.locator('[data-sonner-toast]').filter({ hasText: text });

/** From the lessons home: Prep the next sermon, and the passage. */
async function prep(page: Page, passage: string) {
  await page.getByRole('button', { name: 'Prep the next sermon' }).click();
  const field = page.getByRole('combobox', { name: 'The next sermon’s passage' });
  await expect(field).toBeFocused();
  await field.fill(passage);
  await field.press('Enter');
}

test.use({ viewport: { width: 390, height: 844 } });

test.beforeEach(async ({ page }) => {
  // Monday 19 October 2026: the next sermon is on Sunday the 25th.
  await page.clock.install({ time: new Date('2026-10-19T09:00:00') });
});

test('the prep card shows what Lamp has on the passage, and capture opens its draft with it pinned', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await writeRows(page, seed());
  await page.reload();

  await prep(page, 'John 11:1-44');
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByRole('heading')).toHaveText('Next sermon · Sun 25 Oct');
  // The draft: a sermon on the passage on Sunday, in the series of the last sermon.
  const series = (await rows<{ id: string }>(page, 'series'))[0]!;
  await expect
    .poll(async () => (await rows<Lesson>(page, 'lesson')).find((l) => l.date === '2026-10-25'))
    .toMatchObject({
      title: 'John 11:1–44',
      seriesId: series.id,
      mainPassages: [{ display: 'John 11:1–44' }],
    });

  const notes = card(page).getByRole('link', { name: '2 sections in 1 lesson' });
  await expect(notes).toHaveAttribute('href', /\/compile\/JHN\.11\.1-44$/);
  await card(page).getByRole('button', { name: '1 open question' }).click();
  await expect(
    card(page).getByRole('link', { name: 'Why did Jesus wait two days?' }),
  ).toBeVisible();
  await expect(card(page).getByRole('list', { name: 'Tags on it' })).toHaveText('#bethany');
  await expect(
    card(page).getByRole('link', { name: 'Last in John: The Good Shepherd · Sun 11 Oct' }),
  ).toBeVisible();

  // Start capture: the draft in capture mode, the passage pinned.
  await card(page).getByRole('link', { name: 'Start capture' }).click();
  await expect(page).toHaveURL(/\/capture$/);
  await expect(page.getByRole('button', { name: 'John 11:1–44' })).toBeVisible();
  await page.getByRole('region', { name: 'Sections' }).getByRole('textbox').first().click();
  await page.keyboard.type('Lazarus, come out.');
  await expect.poll(async () => (await rows<{ body: unknown }>(page, 'section')).length).toBe(3);

  // Written in: the card has done its work.
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(
    'John 11:1–44',
  );
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Prep the next sermon' })).toBeVisible();
  await expect(card(page)).toBeHidden();
});

test('a passage with nothing on it starts fresh; ✕ clears the prep with Undo', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await writeRows(page, seed());
  await page.reload();

  // A passage that can't exist says why, and keeps the text.
  await prep(page, 'John 22');
  await expect(page.getByText('John has 21 chapters.')).toBeVisible();
  const field = page.getByRole('combobox', { name: 'The next sermon’s passage' });
  await field.fill('Ruth 1');
  await field.press('Enter');
  await expect(card(page)).toContainText('Nothing on Ruth 1 yet. You’ll start fresh.');

  await card(page).getByRole('button', { name: 'Clear the prep' }).click();
  await expect(card(page)).toBeHidden();
  await expect.poll(async () => (await rows<Lesson>(page, 'lesson')).length).toBe(2);
  await toast(page, 'Prep cleared.').getByRole('button', { name: 'Undo' }).click();
  await expect(card(page)).toContainText('Ruth 1');
  await expect.poll(async () => (await rows<Lesson>(page, 'lesson')).length).toBe(3);
});
