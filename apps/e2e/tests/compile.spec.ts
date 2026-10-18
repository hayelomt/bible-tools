import { readFile } from 'node:fs/promises';
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
import { type Seed, writeRows } from './helpers.ts';

/** Opening a lesson with 50 sections (TECH-DESIGN §14), the M7-07 budget a book's first screen meets. */
const BUDGET_MS = 100;

// The compile view, called Commentary in the app (F22, M10-02): every section citing a passage as
// one read-only document, grouped under the verses they cite.

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

/** A lesson as written: its notes, and replies as `['note', ['reply']]`. */
interface LessonPlan {
  title: string;
  date: string;
  notes: (string | [string, string[]])[];
}

/** The lessons' rows, checked against the sync schemas, with their citations. */
function seed(plans: LessonPlan[]): Seed {
  const lessons: EntityRow<'lesson'>[] = [];
  const sections: EntityRow<'section'>[] = [];
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
    sections.push(row);
    return row;
  };
  for (const plan of plans) {
    const lesson = ENTITY_SCHEMAS.lesson.parse({
      ...synced(),
      seriesId: null,
      title: plan.title,
      date: plan.date,
      kind: 'sermon',
      speaker: null,
      church: null,
      mainPassages: [],
    });
    lessons.push(lesson);
    const keys = keysBetween(null, null, plan.notes.length);
    plan.notes.forEach((note, i) => {
      const [text, replies] = typeof note === 'string' ? [note, []] : note;
      const parent = section(lesson.id, null, keys[i]!, text);
      const replyKeys = keysBetween(null, null, replies.length);
      replies.forEach((reply, r) => section(lesson.id, parent.id, replyKeys[r]!, reply));
    });
  }
  const citation = sections
    .flatMap((row) => citationsFor('section', row))
    .map((entry) => ({ id: newId(), ...entry }));
  return { lesson: lessons, section: sections, citation };
}

async function seeded(page: Page, plans: LessonPlan[]) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  await writeRows(page, seed(plans));
}

const ROMANS: LessonPlan[] = [
  {
    title: 'The Good Shepherd',
    date: '2026-10-12',
    notes: [
      [
        'All things work together {Rom 8:28} and nothing separates us {Rom 8:38}.',
        ['Even this week. {Rom 8:28}', 'A reply that cites nothing.'],
      ],
      'Nothing cited here.',
    ],
  },
  {
    title: 'Justified by faith',
    date: '2025-09-07',
    notes: ['No condemnation: the verdict is already in. {Rom 8:1}', 'Paul’s grief. {Rom 9:1}'],
  },
  { title: 'Adopted', date: '2026-03-01', notes: ['Abba, Father. {Rom 8:15}'] },
];

/** The groups' headings; in a book, `level` 3 is its chapters and 4 their groups. */
const groups = (page: Page, level: 3 | 4 = 3) =>
  page.getByRole('main').getByRole('heading', { level });

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Romans 8 reads as one commentary, from the verse index', async ({ page }) => {
    await seeded(page, ROMANS);
    await page.goto('/verses/ROM.8');
    await page.getByRole('link', { name: 'Read Romans 8 as commentary' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Commentary');
    await expect(page.getByRole('heading', { level: 2, name: 'Romans 8' })).toBeVisible();
    await expect(page.getByText('4 sections in 3 lessons')).toBeVisible();
    // By the verse they cite; a section citing two is in full under the first, and points there
    // from the other.
    await expect(groups(page)).toHaveText([
      'Romans 8:1',
      'Romans 8:15',
      'Romans 8:28',
      'Romans 8:38',
    ]);
    const promise = page.getByRole('article', { name: 'The Good Shepherd, Mon 12 Oct 2026' });
    await expect(promise).toHaveCount(2);
    await expect(promise.first()).toContainText('All things work together');
    await expect(promise.nth(1)).toContainText('Even this week.');
    await expect(page.getByText('A reply that cites nothing.')).toHaveCount(0);
    await expect(page.getByText('Nothing cited here.')).toHaveCount(0);

    await expect(page.getByRole('button', { name: 'Under Romans 8:28' })).toBeVisible();

    // "Also under" goes to the other group.
    await promise.first().getByRole('button', { name: 'Romans 8:38', exact: true }).click();
    await expect(groups(page).last()).toBeFocused();

    // A chip opens as in a note, and leads to its commentary.
    await promise
      .first()
      .getByRole('button', { name: /^Romans 8:28, Berean Standard Bible/ })
      .click();
    const viewer = page.getByRole('dialog', { name: 'Romans 8:28' });
    await viewer.getByRole('link', { name: 'Read as commentary' }).click();
    await expect(page).toHaveURL(/\/compile\/ROM\.8\.28$/);
    await expect(
      page.getByRole('main').getByRole('heading', { level: 2, name: 'Romans 8:28' }),
    ).toBeVisible();
    await expect(groups(page)).toHaveText(['Romans 8:28']);

    // The scope widens to the book, a chapter heading above each chapter's groups.
    await page.getByRole('radio', { name: 'Romans', exact: true }).check();
    await expect(page.getByRole('heading', { level: 2, name: 'Romans' })).toBeVisible();
    await expect(groups(page)).toHaveText(['Romans 8', 'Romans 9']);
    await expect(groups(page, 4)).toHaveText([
      'Romans 8:1',
      'Romans 8:15',
      'Romans 8:28',
      'Romans 8:38',
      'Romans 9:1',
    ]);

    // A byline opens the section in its lesson.
    await page
      .getByRole('link', { name: /^Justified by faith · Sun 7 Sept? 2025/ })
      .last()
      .click();
    await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Justified by faith');
    await expect(page.locator('[data-flash]')).toContainText('Paul’s grief.');
  });

  test('the commentary exports as Markdown', async ({ page }) => {
    await seeded(page, ROMANS);
    await page.goto('/compile/ROM.8');
    await page.getByRole('button', { name: 'Commentary actions' }).click();
    await page.getByRole('menuitem', { name: 'Export…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Export the commentary on Romans 8' });
    await expect(dialog.getByRole('button', { name: /Print/ })).toHaveCount(0);
    const downloading = page.waitForEvent('download');
    await dialog.getByRole('button', { name: 'Markdown file (.md)' }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('commentary-on-romans-8.md');
    const markdown = await readFile((await download.path())!, 'utf8');
    expect(markdown).toMatch(
      /^# Commentary on Romans 8\n\n4 sections in 3 lessons\n\n## Romans 8:1\n/,
    );
    expect(markdown).toContain('*Also under Romans 8:38*');
  });

  test('a passage nothing cites says so, and one that isn’t a passage is not found', async ({
    page,
  }) => {
    await page.goto('/compile/ROM.3');
    await expect(
      page.getByText(
        'Nothing cites Romans 3 yet. Sections that cite it will show here as one document.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read Romans 3' })).toBeVisible();
    await page.goto('/compile/ROM.99');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Passage not found');
  });
});

test.describe('on a laptop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the side panel outlines the groups and jumps to one', async ({ page }) => {
    await seeded(page, ROMANS);
    await page.goto('/compile/ROM.8');
    const outline = page.getByRole('navigation', { name: 'In this commentary' });
    await expect(outline.getByRole('button')).toHaveText([
      'Romans 8:11',
      'Romans 8:151',
      'Romans 8:282',
      'Romans 8:381',
    ]);
    await outline.getByRole('button', { name: /^Romans 8:38/ }).click();
    await expect(groups(page).last()).toBeFocused();
  });
});

/** 50 lessons a week apart, each with 10 sections citing verses across Romans. */
function aBookOfNotes(): LessonPlan[] {
  return Array.from({ length: 50 }, (_, l) => ({
    title: `Romans, week ${l + 1}`,
    date: new Date(Date.UTC(2025, 0, 5 + l * 7)).toISOString().slice(0, 10),
    notes: Array.from({ length: 10 }, (__, s) => {
      const chapter = ((l * 10 + s) % 16) + 1;
      const verse = ((l * 7 + s * 3) % 14) + 1;
      return `Week ${l + 1}, note ${s + 1}: what the apostle says here, and what it means for us this week. {Rom ${chapter}:${verse}}`;
    }),
  }));
}

test('a book with 500 sections shows its first screen within the lesson-open budget', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await seeded(page, aBookOfNotes());
  // Chrome slowed four times: the usual stand-in for a mid-range phone.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // The median of three opens, so one slow moment on a busy machine doesn't decide it.
  const times: number[] = [];
  for (let i = 0; i < 3; i++) {
    await page.goto('/compile/ROM.8?scope=book');
    const ready = await page.waitForFunction(
      () =>
        (performance.getEntriesByName('lamp:commentary-ready')[0] as PerformanceMark | undefined)
          ?.detail ?? null,
      undefined,
      { timeout: 30_000 },
    );
    const { ms, sections } = (await ready.jsonValue()) as { ms: number; sections: number };
    expect(sections).toBe(500);
    times.push(ms);
  }
  const median = times.toSorted((a, b) => a - b)[1]!;
  console.log(
    `Commentary: 500 sections, first screen in ${times.map(Math.round).join(', ')} ms (median ${Math.round(median)})`,
  );
  expect(median).toBeLessThan(BUDGET_MS);
  await expect(page.getByText('500 sections in 50 lessons')).toBeVisible();
  await expect(groups(page).first()).toHaveText('Romans 1');
  // The rest arrives as it's drawn: the last chapter's heading is there in the end.
  await expect(
    page.getByRole('heading', { level: 3, name: 'Romans 16', exact: true }),
  ).toBeAttached({
    timeout: 20_000,
  });
});
