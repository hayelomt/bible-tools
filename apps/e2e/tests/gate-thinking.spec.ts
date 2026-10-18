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
import { newLesson, rows, type Seed, writeRows } from './helpers.ts';

// The M10 gate (PRD v2 milestones G): opening Romans 8 shows every section ever written on it as
// one document; a question's history reads as a thread. A year of lessons is written to the
// device as a sync pull would leave it; then Romans 8 is read as commentary, and a question from
// one of them is revisited from a new lesson, answered there and read as a thread.

const NOW = new Date().toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

function verseRef(reference: string) {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref, translation: DEFAULT_TRANSLATION };
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

const QUESTION = 'Why does creation groan?';
const ASKED_IN = 'Creation groans';

/** A Sunday a week for a year, back from 11 October 2026: "2025-10-19" … "2026-10-11". */
const SUNDAYS = Array.from({ length: 52 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 9, 11 - 7 * (51 - i)));
  return day.toISOString().slice(0, 10);
});

/** Romans 8 is cited in every fourth lesson, once, and in a reply in the one that asks. */
const ROMANS_8: string[] = [];
/** The lessons citing it. */
const CITING = new Set<string>();

/** The year's rows, checked against the sync schemas, with their citations. */
function seedYear(): Seed {
  const seed = {
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
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
    });
    seed.section.push(row);
    return row;
  };
  SUNDAYS.forEach((date, week) => {
    const asking = week === 20;
    const title = asking ? ASKED_IN : `Week ${week + 1}`;
    const lesson = ENTITY_SCHEMAS.lesson.parse({
      ...synced(),
      seriesId: null,
      title,
      date,
      kind: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    });
    seed.lesson.push(lesson);
    const notes = [
      `Week ${week + 1} opens with the Psalms. {Ps ${(week % 150) + 1}:1}`,
      week % 4 === 0 || asking
        ? `Week ${week + 1} on Romans 8. {Rom 8:${(week % 39) + 1}}`
        : `Week ${week + 1} on Romans 7. {Rom 7:${(week % 25) + 1}}`,
      `Week ${week + 1} closes with Romans 9. {Rom 9:${(week % 33) + 1}}`,
    ];
    const keys = keysBetween(null, null, notes.length);
    notes.forEach((note, i) => {
      const parent = section(lesson.id, null, keys[i]!, note);
      if (note.includes('Romans 8')) {
        ROMANS_8.push(note.replace(/ \{.*\}$/, ''));
        CITING.add(lesson.id);
      }
      if (asking && i === 1) {
        const reply = 'Groaning, as in childbirth.';
        section(lesson.id, parent.id, keysBetween(null, null, 1)[0]!, `${reply} {Rom 8:22}`);
        ROMANS_8.push(reply);
      }
    });
    if (asking) {
      // Asked that Sunday, so the thread goes back months.
      const then = { createdAt: `${date}T10:00:00.000Z`, updatedAt: `${date}T10:00:00.000Z` };
      const question = ENTITY_SCHEMAS.question.parse({
        ...synced(),
        ...then,
        lessonId: lesson.id,
        text: QUESTION,
        splitFromId: null,
      });
      seed.question.push(question);
      seed.questionEntry.push(
        ENTITY_SCHEMAS.questionEntry.parse({
          ...synced(),
          ...then,
          questionId: question.id,
          lessonId: lesson.id,
          kind: 'asked',
          sectionId: null,
        }),
      );
    }
  });
  const citation = seed.section
    .flatMap((row) => citationsFor('section', row))
    .map((entry) => ({ id: newId(), ...entry }));
  return { ...seed, citation };
}

const thread = (page: Page) => page.getByRole('list', { name: 'Thread' }).getByRole('listitem');

test('Romans 8 reads as one document across a year, and a revisited question as a thread', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await writeRows(page, seedYear());
  await page.reload();
  await expect.poll(async () => (await rows(page, 'lesson')).length).toBe(52);

  // Romans 8, from search: every section citing it, and nothing else.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Search' })
    .click();
  await page.getByRole('searchbox', { name: 'Search' }).fill('rom 8');
  await page.getByRole('link', { name: 'Read Romans 8 as commentary' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commentary');
  await expect(
    page.getByText(`${ROMANS_8.length} sections in ${CITING.size} lessons`),
  ).toBeVisible();
  const articles = page.getByRole('main').getByRole('article');
  await expect(articles).toHaveCount(ROMANS_8.length);
  for (const note of ROMANS_8) {
    await expect(articles.filter({ hasText: note })).toHaveCount(1);
  }
  await expect(page.getByRole('main')).not.toContainText('Romans 7');
  await expect(page.getByRole('main')).not.toContainText('Romans 9');

  // The question from that week, revisited from a new lesson: one thread across both.
  await page.goto('/');
  await newLesson(page, 'Hope in suffering');
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByRole('menuitem', { name: 'Revisit a question…' }).click();
  const revisit = page.getByRole('dialog', { name: 'Revisit a question' });
  await revisit.getByRole('searchbox', { name: 'Search questions' }).fill('groan');
  await revisit.getByRole('button', { name: 'Revisit' }).click();
  const row = page.getByRole('region', { name: 'Questions' }).getByRole('listitem');
  await expect(row).toHaveText([/^Revisited here, open: Why does creation groan\?/]);
  await row.getByRole('button', { name: 'Question actions' }).click();
  await page.getByRole('menuitem', { name: 'Thread' }).click();
  await expect(page.getByRole('heading', { level: 2, name: QUESTION })).toBeVisible();
  const address = page.url();

  // Answered in the new lesson, the latest the thread names.
  await page.getByRole('link', { name: 'Answer', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Hope in suffering');
  const answer = page.locator('[data-section]').filter({ hasText: QUESTION });
  await expect(answer.getByRole('textbox')).toBeFocused();
  await page.keyboard.type('It waits for the sons of God.');
  await expect
    .poll(async () => JSON.stringify(await rows(page, 'section')))
    .toContain('It waits for the sons of God.');

  await page.goto(address);
  await expect(page.getByText(/^Answered · Asked 2 times since \w+$/)).toBeVisible();
  await expect(thread(page)).toHaveText([
    new RegExp(`^Asked · .+${ASKED_IN}$`),
    /^Revisited · .+Hope in suffering$/,
    /^Answered · .+Hope in suffering“It waits for the sons of God\.”$/,
  ]);
});
