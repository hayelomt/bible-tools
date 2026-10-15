import { expect, type Page, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// The M2 gate (PRD Milestones A): a sermon captured offline in the installed app, then reopened.
test.use({ serviceWorkers: 'allow' });

/** Every entity that syncs one row per id (TECH-DESIGN §6.1). */
const ENTITIES = [
  'series',
  'lesson',
  'section',
  'tag',
  'sectionTag',
  'lessonTag',
  'takeaway',
  'question',
  'highlight',
  'memoryItem',
] as const;

type Entity = (typeof ENTITIES)[number];

/** A row as an upsert carries it: everything but `rev`, which the server assigns. */
interface Row {
  id: string;
  parentId?: string | null;
  [field: string]: unknown;
}

/** An outbox entry; settings changes have no `entityId`. */
type Change = { seq: number; entity: string; entityId?: string } & (
  { op: 'upsert'; row: Row } | { op: 'delete' }
);

/** Each entity's live rows as the outbox, played in order, would leave them. */
async function replayOutbox(page: Page): Promise<Record<Entity, Row[]>> {
  const changes = await rows<Change>(page, 'outbox');
  const latest = new Map<string, Row | null>();
  for (const change of changes.toSorted((a, b) => a.seq - b.seq)) {
    if (change.entityId === undefined) continue;
    latest.set(`${change.entity}:${change.entityId}`, change.op === 'upsert' ? change.row : null);
  }
  return Object.fromEntries(
    ENTITIES.map((entity) => [
      entity,
      [...latest]
        .filter(([key, row]) => key.startsWith(`${entity}:`) && row !== null)
        .map(([, row]) => row!)
        .toSorted(byId),
    ]),
  ) as Record<Entity, Row[]>;
}

/** Each entity's live rows as stored on the device, `rev` left out. */
async function stored(page: Page): Promise<Record<Entity, Row[]>> {
  const all = await Promise.all(
    ENTITIES.map(async (entity) => {
      const live = await rows<Row>(page, entity);
      const withoutRev = live.map(
        (row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'rev')) as Row,
      );
      return [entity, withoutRev.toSorted(byId)] as const;
    }),
  );
  return Object.fromEntries(all) as Record<Entity, Row[]>;
}

const byId = (a: Row, b: Row) => (a.id < b.id ? -1 : 1);

const note = (page: Page, n = 0) => page.getByRole('textbox', { name: 'Note', exact: true }).nth(n);
const reply = (page: Page, n = 0) =>
  page.getByRole('textbox', { name: 'Reply', exact: true }).nth(n);
const chip = (page: Page, name: string) =>
  page.getByRole('button', { name: `${name}, Berean Standard Bible, verse. Show text.` });

/** The lesson as it reads on screen: its sections and reply, with their chips. */
async function expectCapturedLesson(page: Page) {
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue('Life in the Spirit');
  await expect(note(page, 0)).toHaveText(
    'No condemnation for those in Christ, Romans 8:1 · BSB right at the start',
  );
  await expect(note(page, 1)).toHaveText('All things work together for good');
  await expect(reply(page)).toHaveText('Even suffering, Romans 8:28 · BSB said it');
  await expect(note(page, 2)).toHaveText('Nothing can separate us from his love');
  // The empty section at the end, ready for more.
  await expect(note(page, 3)).toHaveText('');
  await expect(page.getByRole('textbox', { name: /^(Note|Reply)$/ })).toHaveCount(5);

  await chip(page, 'Romans 8:28').click();
  await expect(page.getByRole('dialog')).toContainText(
    'And we know that God works all things together for the good',
  );
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
}

test('a sermon captured offline reopens whole, with every change in the outbox', async ({
  page,
  context,
}) => {
  // Installed and the Bible downloaded, on an earlier visit.
  await page.goto('/');
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await page.goto('/settings');
  await expect(page.getByRole('region', { name: 'Bible' }).getByLabel('Downloaded')).toBeVisible({
    timeout: 30_000,
  });

  // At church, with no connection.
  await context.setOffline(true);
  await page.goto('/');
  await expect(page.getByText('Your notes start here.')).toBeVisible();
  await newLesson(page, 'Life in the Spirit');
  await page.getByRole('textbox', { name: 'Title' }).press('Enter');
  await expect(note(page)).toBeFocused();

  // Three sections; the second has a reply. A chip in the first section and one in the reply.
  await page.keyboard.type('No condemnation for those in Christ, Rom 8:1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('right at the start');
  await expect(note(page)).toHaveText(
    'No condemnation for those in Christ, Romans 8:1 · BSB right at the start',
  );
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await expect(note(page, 1)).toBeFocused();

  await page.keyboard.type('All things work together for good');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await expect(reply(page)).toBeFocused();
  await page.keyboard.type('Even suffering, Rom 8:28');
  await page.keyboard.press('Enter');
  await page.keyboard.type('said it');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  // A new reply under the same section; Enter again moves it out to a section of its own.
  await page.keyboard.press('Enter');
  await expect(note(page, 2)).toBeFocused();

  await page.keyboard.type('Nothing can separate us from his love');
  await expect.poll(async () => (await rows(page, 'section')).length, { timeout: 5_000 }).toBe(4);

  // Reloaded, still offline: every word is there, and the chips keep their text.
  await page.reload();
  await expectCapturedLesson(page);

  // Reopened from the lessons home.
  await page.getByRole('link', { name: 'Back' }).click();
  await page.getByRole('link', { name: /Life in the Spirit/ }).click();
  await expectCapturedLesson(page);

  // The outbox, played in order, gives back exactly what's stored, so sync will send it all.
  const queued = await replayOutbox(page);
  expect(queued.lesson).toHaveLength(1);
  expect(queued.section).toHaveLength(4);
  expect(queued.section.filter((s) => s.parentId !== null)).toHaveLength(1);
  expect(queued).toEqual(await stored(page));
});
