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
import { rows } from './helpers.ts';

// The M4 gate (PRD Milestones C): any past note can be found by tag, by text or by verse. A month
// of lessons is written to the device as a sync pull would leave it, then one note is found
// each way on a phone.
test.use({ viewport: { width: 390, height: 844 } });

/** A lesson as written: its notes, with `{Mt 18:22}` for a verse chip and `#tag` at the end. */
interface LessonPlan {
  title: string;
  date: string;
  main?: string;
  notes: string[];
  takeaway: string;
  question: string;
}

/** Sundays and Wednesdays from 13 September to 11 October 2026. */
const MONTH: LessonPlan[] = [
  {
    title: 'The sower',
    date: '2026-09-13',
    main: 'Matt 13',
    notes: [
      'Four soils, one seed. {Matt 13:3-9}',
      'The path: the word is snatched before it takes root.',
      'Rocky ground: joy without depth wilts in the heat. #suffering',
      'Good soil bears thirty, sixty, a hundredfold. {Matt 13:23}',
    ],
    takeaway: 'Hearing is not the same as understanding.',
    question: 'Which soil am I this season?',
  },
  {
    title: 'Small group: prayer',
    date: '2026-09-16',
    notes: [
      'Ask, seek, knock: keep on asking. {Matt 7:7-8} #prayer',
      'The Father gives good gifts to those who ask.',
      'Prayed for Sam’s new job and for the Lees.',
    ],
    takeaway: 'Pray specific prayers.',
    question: 'Why do I give up asking so quickly?',
  },
  {
    title: 'Treasure and pearl',
    date: '2026-09-20',
    main: 'Matt 13:44-46',
    notes: [
      'The man sells all he has, in his joy. {Matt 13:44}',
      'The merchant knows the worth of the pearl.',
      'What I hold onto shows what I think is treasure. #stewardship',
    ],
    takeaway: 'Joy, not duty, drives the selling.',
    question: 'What would I not give up?',
  },
  {
    title: 'Seventy times seven',
    date: '2026-09-23',
    notes: [
      'Peter thinks seven times is generous.',
      'Forgiveness keeps no ledger: seventy times seven. {Matt 18:21-22} #forgiveness',
      'The servant forgiven ten thousand talents chokes a man over a hundred denarii.',
      'Forgive from the heart, not only in words. {Matt 18:35}',
    ],
    takeaway: 'I have been forgiven more than I will ever forgive.',
    question: 'Who am I still keeping score with?',
  },
  {
    title: 'The vineyard workers',
    date: '2026-09-27',
    main: 'Matt 20:1-16',
    notes: [
      'Everyone gets a denarius, whatever hour they started.',
      'Is your eye evil because I am good? {Matt 20:15}',
      'Grace offends our sense of fairness. #grace',
    ],
    takeaway: 'The last will be first.',
    question: 'Do I resent generosity to others?',
  },
  {
    title: 'Small group: the Lord’s Prayer',
    date: '2026-09-30',
    notes: [
      'Forgive us our debts, as we also forgive our debtors. {Matt 6:12} #forgiveness',
      'If you don’t forgive, neither will your Father. {Matt 6:14-15}',
      'Daily bread: enough for today.',
    ],
    takeaway: 'Forgiveness received and given go together.',
    question: 'Why “debts” rather than “sins”?',
  },
  {
    title: 'The lost sheep',
    date: '2026-10-04',
    main: 'Matt 18:10-14',
    notes: [
      'The shepherd leaves the ninety-nine. {Matt 18:12}',
      'He rejoices more over the one. #love',
      'It is not the will of the Father that one should perish. {Matt 18:14}',
    ],
    takeaway: 'God goes after the one.',
    question: 'Who is the one I should go after?',
  },
  {
    title: 'Small group: reconciliation',
    date: '2026-10-07',
    notes: [
      'Go and show him his fault, between you and him alone. {Matt 18:15}',
      'Leave your gift at the altar; first be reconciled. {Matt 5:23-24} #forgiveness',
      'Talked about the conflict at work; pray for courage.',
    ],
    takeaway: 'Go privately first.',
    question: 'What stops me going first?',
  },
  {
    title: 'The wedding feast',
    date: '2026-10-11',
    main: 'Matt 22:1-14',
    notes: [
      'The invited would not come.',
      'Go to the crossroads and invite anyone you find. {Matt 22:9} #mission',
      'Many are called, few chosen. {Matt 22:14}',
    ],
    takeaway: 'The invitation is wide.',
    question: 'What is the wedding garment?',
  },
];

const NOW = new Date().toISOString();
const synced = () => ({ id: newId(), createdAt: NOW, updatedAt: NOW, rev: 0, deletedAt: null });

function verseRef(reference: string) {
  const parsed = parseReference(reference);
  if (!parsed.ok) throw new Error(`Not a reference: ${reference}`);
  return { ...parsed.ref, translation: DEFAULT_TRANSLATION };
}

/** A note's text as a section body, its `{chips}` as verse nodes; and its `#tag`, if any. */
function noteBody(note: string): [SectionBody, string | undefined] {
  const [, text = '', tag] = /^(.*?)(?: #(\w+))?$/.exec(note) ?? [];
  const content = text
    .split(/(\{[^}]+\})/)
    .filter(Boolean)
    .map((part) =>
      part.startsWith('{')
        ? { type: 'verse' as const, attrs: verseRef(part.slice(1, -1)) }
        : { type: 'text' as const, text: part },
    );
  return [{ type: 'doc', content: [{ type: 'paragraph', content }] }, tag];
}

type Seed = Partial<Record<string, Record<string, unknown>[]>>;

/** Every row of the month, checked against the sync schemas, with the derived citations. */
function seedMonth(tagIds: Map<string, string>): Seed {
  const seed = {
    lesson: [] as EntityRow<'lesson'>[],
    section: [] as EntityRow<'section'>[],
    sectionTag: [] as EntityRow<'sectionTag'>[],
    takeaway: [] as EntityRow<'takeaway'>[],
    question: [] as EntityRow<'question'>[],
  };
  for (const plan of MONTH) {
    const lesson = ENTITY_SCHEMAS.lesson.parse({
      ...synced(),
      seriesId: null,
      title: plan.title,
      date: plan.date,
      source: plan.title.startsWith('Small group') ? 'group' : 'sermon',
      speaker: null,
      church: null,
      mainPassages: plan.main ? [verseRef(plan.main)] : [],
    });
    seed.lesson.push(lesson);
    const keys = keysBetween(null, null, plan.notes.length);
    plan.notes.forEach((note, i) => {
      const [body, tag] = noteBody(note);
      const section = ENTITY_SCHEMAS.section.parse({
        ...synced(),
        lessonId: lesson.id,
        parentId: null,
        orderKey: keys[i],
        body,
        conflictOf: null,
        conflictDevice: null,
      });
      seed.section.push(section);
      if (tag) {
        const tagId = tagIds.get(tag);
        if (!tagId) throw new Error(`No seeded tag #${tag}`);
        seed.sectionTag.push(
          ENTITY_SCHEMAS.sectionTag.parse({ ...synced(), tagId, sectionId: section.id }),
        );
      }
    });
    seed.takeaway.push(
      ENTITY_SCHEMAS.takeaway.parse({ ...synced(), lessonId: lesson.id, text: plan.takeaway }),
    );
    seed.question.push(
      ENTITY_SCHEMAS.question.parse({
        ...synced(),
        lessonId: lesson.id,
        text: plan.question,
        status: 'open',
        answerSectionId: null,
      }),
    );
  }
  const citation = [
    ...seed.lesson.flatMap((row) => citationsFor('lesson', row)),
    ...seed.section.flatMap((row) => citationsFor('section', row)),
  ].map((entry) => ({ id: newId(), ...entry }));
  return { ...seed, citation };
}

/** Writes `seed` into the device database in one transaction, as a pull would. */
async function write(page: Page, seed: Seed) {
  await page.evaluate(async (tables) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open('lamp');
      open.addEventListener('success', () => resolve(open.result));
      open.addEventListener('error', () => reject(open.error));
    });
    const tx = db.transaction(Object.keys(tables), 'readwrite');
    for (const [table, list] of Object.entries(tables)) {
      for (const row of list ?? []) tx.objectStore(table).put(row);
    }
    await new Promise((resolve, reject) => {
      tx.addEventListener('complete', resolve);
      tx.addEventListener('error', () => reject(tx.error));
    });
    db.close();
  }, seed);
}

const box = (page: Page) => page.getByRole('searchbox', { name: 'Search' });
const TARGET = /^Forgiveness keeps no ledger/;

/** The note opened from a result: the lesson, scrolled to it and highlighted. */
async function expectTargetOpened(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Seventy times seven');
  await expect(page.locator('[data-flash]')).toContainText('Forgiveness keeps no ledger');
  await expect(page.locator('[data-flash]')).toBeInViewport();
}

test('a note from a month of lessons is found by tag, by text and by verse', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New lesson' })).toBeVisible();
  const tags = await rows<{ id: string; name: string }>(page, 'tag');
  await write(page, seedMonth(new Map(tags.map((t) => [t.name, t.id]))));
  await page.reload();
  await expect(page.getByRole('link', { name: /The wedding feast/ })).toBeVisible();
  expect(await rows(page, 'lesson')).toHaveLength(MONTH.length);

  const searchTab = page.getByRole('navigation', { name: 'Main' }).getByRole('link', {
    name: 'Search',
  });

  // By tag: #forg suggests #forgiveness on three notes; the note is among them.
  await searchTab.click();
  await box(page).fill('#forg');
  await page
    .getByRole('list', { name: 'Tags' })
    .getByRole('button', { name: '#forgiveness · 3' })
    .click();
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    /^Small group: reconciliation/,
    /^Small group: the Lord’s Prayer/,
    /^Seventy times seven/,
  ]);
  await page.getByRole('link', { name: TARGET }).click();
  await expectTargetOpened(page);

  // By text: a few words remembered from it.
  await searchTab.click();
  await box(page).fill('ledger forgiveness');
  await expect(page.getByText('1 result in 1 lesson')).toBeVisible();
  await page.getByRole('link', { name: TARGET }).click();
  await expectTargetOpened(page);

  // By verse: Matthew 18, then its verse index, newest first.
  await searchTab.click();
  await box(page).fill('mt 18');
  await expect(page.getByText('Matthew 18 · 6 notes')).toBeVisible();
  await page.getByRole('link', { name: 'Verse index for Matthew 18' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Matthew 18');
  await expect(page.getByText('5 notes · main passage of 1 lesson')).toBeVisible();
  const entries = page.getByRole('main').getByRole('listitem');
  await expect(entries).toHaveCount(6);
  await expect(entries.first()).toContainText('Small group: reconciliation');
  await expect(entries.last()).toContainText('Matthew 18:35');
  await page.getByRole('link', { name: /Matthew 18:21–22/ }).click();
  await expectTargetOpened(page);
});
