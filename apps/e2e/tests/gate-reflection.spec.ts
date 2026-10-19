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

// The M12 gate (PRD v2 milestones I): old questions and verses come back on their own; a lesson
// pastes into Notion and prints on one page. A year of weekly lessons is written to a phone as a
// sync pull would leave it, on Monday 19 October 2026. Review brings back the lesson from a year
// ago, Romans 8:28 (cited in four lessons, never read as a commentary) and a question open since
// May. Reading the verse as a commentary and dismissing the question put both away; then the
// lesson that asked it is copied for Notion and printed as a one-page handout.

test.use({ viewport: { width: 390, height: 844 } });

const TODAY = new Date('2026-10-19T09:00:00');
const NOW = TODAY.toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

/** The verse texts the chips captured (BSB). */
const TEXT: Record<string, string> = {
  'Rom 8:22':
    'We know that the whole creation has been groaning together in the pains of childbirth until the present time.',
  'Rom 8:28':
    'And we know that God works all things together for the good of those who love Him, who are called according to His purpose.',
};

function verseRef(reference: string) {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  const snapshotText = TEXT[reference];
  return { ...parsed.ref, translation: DEFAULT_TRANSLATION, ...(snapshotText && { snapshotText }) };
}

/** A note's text as a section body, with `{Rom 8:28}` for a verse chip. */
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

/** A Sunday a week for a year: "2025-10-19" … "2026-10-11". */
const SUNDAYS = Array.from({ length: 52 }, (_, i) =>
  new Date(Date.UTC(2025, 9, 19 + 7 * i)).toISOString().slice(0, 10),
);

const YEAR_AGO = 'The vine and the branches';
const ASKED_IN = 'Creation groans';
/** Week 30, Sunday 10 May 2026: over 90 days before. */
const ASKED_WEEK = 29;
/** Romans 8:28 is cited in these weeks' lessons: four of them, and nowhere else. */
const ROMANS_8_28 = new Set([5, 17, ASKED_WEEK, 41]);
const STALE = 'Why does creation groan?';
/** Asked three weeks before: open, but not stale. */
const RECENT = 'What does abiding look like?';
const RECENT_WEEK = 49;

/** The year's rows, checked against the sync schemas, with their citations. */
function seedYear(tagIds: Map<string, string>): Seed {
  const seed = {
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
    sectionTag: [] as EntityRow<'sectionTag'>[],
    takeaway: [] as EntityRow<'takeaway'>[],
    question: [] as EntityRow<'question'>[],
    questionEntry: [] as EntityRow<'questionEntry'>[],
  };
  const section = (lessonId: string, parentId: string | null, orderKey: string, note: string) => {
    const row = ENTITY_SCHEMAS.section.parse({
      ...synced(),
      lessonId,
      parentId,
      orderKey,
      body: noteBody(note),
      conflictOf: null,
      conflictDevice: null,
      sourceAt: null,
      sourcePage: null,
    });
    seed.section.push(row);
    return row;
  };
  const ask = (lessonId: string, date: string, text: string) => {
    const then = { createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z` };
    const question = ENTITY_SCHEMAS.question.parse({
      ...synced(),
      ...then,
      lessonId,
      text,
      splitFromId: null,
    });
    seed.question.push(question);
    seed.questionEntry.push(
      ENTITY_SCHEMAS.questionEntry.parse({
        ...synced(),
        ...then,
        questionId: question.id,
        lessonId,
        kind: 'asked',
        sectionId: null,
      }),
    );
  };

  SUNDAYS.forEach((date, week) => {
    const title = week === 0 ? YEAR_AGO : week === ASKED_WEEK ? ASKED_IN : `Week ${week + 1}`;
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
      mainPassages: week === ASKED_WEEK ? [verseRef('Rom 8:18-30')] : [],
    });
    seed.lesson.push(lesson);
    // Each week its own psalm, so only Romans 8:28 is cited in three lessons or more.
    const notes = [`Week ${week + 1} opens with the Psalms. {Ps ${week + 1}:1}`];
    if (week === ASKED_WEEK) notes.push('All creation groans together. {Rom 8:22}');
    if (ROMANS_8_28.has(week)) notes.push('God works all things together for good. {Rom 8:28}');
    const keys = keysBetween(null, null, notes.length);
    notes.forEach((note, i) => {
      const parent = section(lesson.id, null, keys[i]!, note);
      if (note.includes('groans')) {
        section(
          lesson.id,
          parent.id,
          keysBetween(null, null, 1)[0]!,
          'Groaning, as in childbirth.',
        );
        seed.sectionTag.push(
          ENTITY_SCHEMAS.sectionTag.parse({
            ...synced(),
            tagId: tagIds.get('hope')!,
            sectionId: parent.id,
          }),
        );
      }
    });
    if (week === ASKED_WEEK) {
      ask(lesson.id, date, STALE);
      seed.takeaway.push(
        ENTITY_SCHEMAS.takeaway.parse({
          ...synced(),
          lessonId: lesson.id,
          text: 'Suffering is not the end of the story.',
        }),
      );
    }
    if (week === RECENT_WEEK) ask(lesson.id, date, RECENT);
  });
  const citation = [
    ...seed.lesson.flatMap((row) => citationsFor('lesson', row)),
    ...seed.section.flatMap((row) => citationsFor('section', row)),
  ].map((entry) => ({ id: newId(), ...entry }));
  return { ...seed, citation };
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

const backAgain = (page: Page) => page.getByRole('region', { name: 'Back again' });
const reviewTab = (page: Page) =>
  page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /^Review/ });

test('a year of lessons brings back a question and a verse; a lesson goes to Notion and one page', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.clock.install({ time: TODAY });
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await stubPrint(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  const tags = await rows<{ id: string; name: string }>(page, 'tag');
  await writeRows(page, seedYear(new Map(tags.map((t) => [t.name, t.id]))));
  await page.reload();
  await expect.poll(async () => (await rows(page, 'lesson')).length).toBe(52);

  // Review: the recent question under Open questions; the year-old lesson, the verse and the
  // stale question under Back again.
  await reviewTab(page).click();
  const open = page.getByRole('region', { name: /^Open questions/ });
  await expect(open).toContainText(RECENT);
  await expect(open).not.toContainText(STALE);
  const back = backAgain(page);
  await expect(back.getByRole('heading', { level: 3 })).toHaveText([
    'A year ago · Sun 19 Oct 2025',
    'Repeated verse · Romans 8:28',
    'Stale question · open 5 months',
  ]);
  await expect(back.getByRole('link', { name: YEAR_AGO })).toBeVisible();
  await expect(back).toContainText('In 4 lessons; never read as a commentary.');
  await expect(back.getByRole('link', { name: STALE, exact: true })).toBeVisible();
  await expect(back).toContainText(`${ASKED_IN} · Sun 10 May`);

  // The verse, read as a commentary, is put away: it was read today.
  await back.getByRole('link', { name: 'Read as commentary' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commentary');
  await expect(page.getByText('4 sections in 4 lessons')).toBeVisible();
  await reviewTab(page).click();
  await expect(back.getByRole('heading', { level: 3 })).toHaveText([
    'A year ago · Sun 19 Oct 2025',
    'Stale question · open 5 months',
  ]);
  expect(await rows(page, 'passageVisit')).toHaveLength(1);

  // The question, dismissed for a year, stays away after a reload.
  await back.getByRole('button', { name: `More for “${STALE}”` }).click();
  await page.getByRole('menuitem', { name: 'Dismiss for a year' }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Hidden until Oct 2027.' }),
  ).toBeVisible();
  await expect(back.getByRole('heading', { level: 3 })).toHaveText([
    'A year ago · Sun 19 Oct 2025',
  ]);
  await page.reload();
  await expect(back.getByRole('heading', { level: 3 })).toHaveText([
    'A year ago · Sun 19 Oct 2025',
  ]);
  await expect(page.getByRole('main')).not.toContainText(STALE);

  // The lesson that asked it, copied for Notion: a reply as a quote, the verse quoted with its
  // reference under it, the tag as a line of text.
  const lessons = await rows<{ id: string; title: string }>(page, 'lesson');
  await page.goto(`/lessons/${lessons.find((l) => l.title === ASKED_IN)!.id}`);
  await expect(page.getByRole('textbox', { name: 'Title', exact: true })).toHaveValue(ASKED_IN);
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  const dialog = page.getByRole('dialog', { name: `Export “${ASKED_IN}”` });
  await dialog.getByRole('button', { name: 'Copy for Notion' }).click();
  await expect(
    page.locator('[data-sonner-toast]').filter({ hasText: 'Copied for Notion.' }),
  ).toBeVisible();
  const notion = await page.evaluate(() => navigator.clipboard.readText());
  expect(notion).toMatch(/^# Creation groans\n\nSunday 10 May 2026 · Sermon\n\n/);
  expect(notion).toContain('All creation groans together. Romans 8:22 (BSB)');
  expect(notion).toContain(`\n\n> ${TEXT['Rom 8:22']}\n\n— Romans 8:22 (BSB)\n\n`);
  expect(notion).toContain('\n\nTags: #hope\n\n');
  expect(notion).toContain('\n\n> Groaning, as in childbirth.\n\n');
  expect(notion).toContain('Suffering is not the end of the story.');
  expect(notion).toContain(STALE);
  // Flat: no nested quotes or indented lists, which Notion doesn't keep.
  expect(notion).not.toMatch(/^> >|^ {2,}[-\d]/m);

  // And printed as a handout: one A4 page and one Letter page.
  await page.getByRole('button', { name: 'Lesson actions' }).click();
  await page.getByRole('menuitem', { name: 'Export…' }).click();
  await dialog.getByRole('button', { name: 'Handout (one page)' }).click();
  await expect(page).toHaveURL((url) => url.pathname.endsWith('/handout'));
  await expect.poll(() => prints(page)).toBe(1);
  const handout = page.getByTestId('handout');
  await expect(handout.getByRole('heading', { level: 1 })).toHaveText(ASKED_IN);
  await expect(handout).toContainText('Romans 8:18–30 (BSB)');
  await expect(handout).toContainText(STALE);
  await expect(page.getByText(/Too long for one page/)).toHaveCount(0);
  for (const format of ['A4', 'Letter'] as const) {
    const pdf = await page.pdf({ format });
    const pages = pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? [];
    expect({ format, pages: pages.length }).toEqual({ format, pages: 1 });
  }
});
