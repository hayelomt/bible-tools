import { shareLinkSchema } from '@lamp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import { HANDOUT } from './int/share.js';
import {
  type Account,
  bodyCiting,
  bodyLinking,
  bodyOf,
  LATER,
  lessonRow,
  pushOk,
  remove,
  ROMANS_8_28,
  type Row,
  sectionRow,
  signUp,
  synced,
  upsert,
} from './int/sync.js';

/**
 * The shared pages at `/s/<token>` (F34, M13-02, M13-03): read-only HTML with no session, showing
 * what the link covers and nothing else of the owner's, or anyone else's.
 */

let t: TestApp;
let client: Client;

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
  client = await createClient(t);
});

/** The owner picks the KJV in Settings. */
const pickKjv = (userId: string) =>
  t.prisma.userSettings.upsert({
    where: { userId },
    update: { defaultTranslation: 'KJV' },
    create: { userId, defaultTranslation: 'KJV' },
  });

/** Pushes rows and gives each its rev, by id. */
async function push(account: Account, changes: { entity: string; row: Row }[]) {
  const results = await pushOk(
    client,
    account,
    changes.map(({ entity, row }) => upsert(entity as never, row)),
  );
  expect(results.map((r) => r.status)).toEqual(changes.map(() => 'applied'));
  return new Map(changes.map(({ row }, i) => [row.id, (results[i] as { rev: number }).rev]));
}

/**
 * An account with a series of two lessons and a private lesson outside it. The shared lesson's
 * section links to the private lesson and quotes Romans 8:28.
 */
async function owner() {
  const account = await signUp(t, client);
  const series = { ...synced(), title: 'Romans', description: 'Eight weeks', kind: 'book_study' };
  const shared = lessonRow({ title: 'More than conquerors', seriesId: series.id });
  const second = lessonRow({
    title: 'Who shall separate',
    seriesId: series.id,
    date: '2026-10-11',
  });
  const secret = lessonRow({ title: 'My private lesson' });
  const section = sectionRow(shared.id, {
    body: {
      type: 'doc',
      content: [
        ...bodyCiting(ROMANS_8_28).content,
        ...bodyLinking('lesson', secret.id, 'Shepherd').content,
        { type: 'paragraph', content: [{ type: 'text', text: '<script>alert(1)</script>' }] },
      ],
    },
  });
  const gone = sectionRow(shared.id, { orderKey: 'a1', body: bodyOf('Deleted thought') });
  const secretSection = sectionRow(secret.id, { body: bodyCiting(ROMANS_8_28) });
  const secretText = sectionRow(secret.id, { orderKey: 'a1', body: bodyOf('PRIVATE NOTE') });
  const takeaway = { ...synced(), lessonId: shared.id, text: 'Hold fast' };
  const question = {
    ...synced(),
    lessonId: shared.id,
    text: 'Who can separate us?',
    splitFromId: null,
    visibility: 'private',
    groupId: null,
  };
  const revs = await push(account, [
    { entity: 'series', row: series },
    { entity: 'lesson', row: shared },
    { entity: 'lesson', row: second },
    { entity: 'lesson', row: secret },
    { entity: 'section', row: section },
    { entity: 'section', row: gone },
    { entity: 'section', row: secretSection },
    { entity: 'section', row: secretText },
    { entity: 'takeaway', row: takeaway },
    { entity: 'question', row: question },
  ]);
  await pushOk(client, account, [remove('section', gone.id, revs.get(gone.id)!)]);
  return { account, series, shared, second, secret, section, revs };
}

async function share(account: Account, body: object): Promise<string> {
  const res = await client.post('/api/share-links', { expiresAt: null, ...body }, account.token);
  expect(res.status).toBe(201);
  return new URL(shareLinkSchema.parse(res.body).url).pathname;
}

const GONE = 'This link doesn’t work any more.';

const page = async (path: string, status = 200) => (await client.get(path).expect(status)).text;

describe('a lesson link', () => {
  it('serves the page with no session, setting no cookie, never indexed or cached', async () => {
    const { account, shared } = await owner();
    const path = await share(account, { targetType: 'lesson', targetId: shared.id });
    const res = await client.get(path).expect(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toMatch(
      /^default-src 'none'; style-src 'sha256-[^']+'; script-src 'none';/,
    );
    expect(res.text).toContain('<meta name="robots" content="noindex, nofollow">');
  });

  it('shows the lesson, its notes with their verse text, takeaways and questions', async () => {
    const { account, shared } = await owner();
    const html = await page(await share(account, { targetType: 'lesson', targetId: shared.id }));
    expect(html).toContain('<h1>More than conquerors</h1>');
    expect(html).toContain('Sunday 4 October 2026 · Sermon');
    expect(html).toContain('<span class="chip">Romans 8:28 (BSB)</span>');
    expect(html).toContain('And we know that God works all things together');
    expect(html).toContain('<li>Hold fast</li>');
    expect(html).toContain('Who can separate us?');
    expect(html).toContain('Scripture: Berean Standard Bible (public domain).');
  });

  it("quotes the app's text in the translation the owner picked (decision 97)", async () => {
    const { account, shared } = await owner();
    await pickKjv(account.id);
    const html = await page(await share(account, { targetType: 'lesson', targetId: shared.id }));
    expect(html).toContain('<span class="chip">Romans 8:28 (KJV)</span>');
    expect(html).toContain('And we know that all things work together for good');
    expect(html).toContain('Scripture: King James Version (public domain).');
  });

  it('escapes what the notes say', async () => {
    const { account, shared } = await owner();
    const html = await page(await share(account, { targetType: 'lesson', targetId: shared.id }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('shows nothing the link does not cover: deleted sections, other lessons, their titles', async () => {
    const { account, shared } = await owner();
    const html = await page(await share(account, { targetType: 'lesson', targetId: shared.id }));
    expect(html).not.toContain('Deleted thought');
    expect(html).not.toContain('PRIVATE NOTE');
    // The chip to the private lesson is its label, as plain text, not that lesson's title.
    expect(html).toContain('Same idea as Shepherd');
    expect(html).not.toContain('My private lesson');
    expect(html).not.toContain('Who shall separate');
  });

  it('shows the latest synced text, and goes when the lesson does', async () => {
    const { account, shared, section, revs } = await owner();
    const path = await share(account, { targetType: 'lesson', targetId: shared.id });
    await pushOk(client, account, [
      upsert(
        'section',
        { ...section, body: bodyOf('Edited later'), updatedAt: LATER },
        revs.get(section.id)!,
      ),
    ]);
    expect(await page(path)).toContain('Edited later');
    await pushOk(client, account, [remove('lesson', shared.id, revs.get(shared.id)!)]);
    expect(await page(path, 404)).toContain(GONE);
  });

  it('records when it was last opened', async () => {
    const { account, shared } = await owner();
    const path = await share(account, { targetType: 'lesson', targetId: shared.id });
    const before = await t.prisma.shareLink.findFirstOrThrow();
    expect(before.lastOpenedAt).toBeNull();
    await page(path);
    const after = await t.prisma.shareLink.findFirstOrThrow();
    expect(after.lastOpenedAt).not.toBeNull();
  });
});

describe('a mistyped or unknown link', () => {
  it('is the not-found page', async () => {
    for (const path of ['/s/nope', `/s/${'a'.repeat(43)}`, `/s/${'a'.repeat(43)}/lessons/x`]) {
      expect(await page(path, 404)).toContain(GONE);
    }
  });

  it('is not an API route, and the API is still under /api', async () => {
    expect((await client.get(`/api/s/${'a'.repeat(43)}`)).status).toBe(404);
    expect((await client.get('/api/health')).status).toBe(200);
  });
});

describe('a series link', () => {
  it('lists its lessons in date order, each a page under the same link', async () => {
    const { account, series, shared, second } = await owner();
    const path = await share(account, { targetType: 'series', targetId: series.id });
    const html = await page(path);
    expect(html).toContain('<h1>Romans</h1>');
    expect(html).toContain('Book study · 2 lessons');
    expect(html.indexOf('More than conquerors')).toBeLessThan(html.indexOf('Who shall separate'));
    expect(html).toContain(`href="${path}/lessons/${second.id}"`);
    expect(html).not.toContain('My private lesson');
    const lesson = await page(`${path}/lessons/${shared.id}`);
    expect(lesson).toContain('<h1>More than conquerors</h1>');
    expect(lesson).toContain(`<a class="back" href="${path}">← Romans</a>`);
  });

  it("doesn't open a lesson outside the series, or anyone else's", async () => {
    const { account, series, secret } = await owner();
    const theirs = await owner();
    const path = await share(account, { targetType: 'series', targetId: series.id });
    expect(await page(`${path}/lessons/${secret.id}`, 404)).toContain(GONE);
    expect(await page(`${path}/lessons/${theirs.shared.id}`, 404)).toContain(GONE);
  });

  it("a lesson link doesn't open lessons under it", async () => {
    const { account, shared, second } = await owner();
    const path = await share(account, { targetType: 'lesson', targetId: shared.id });
    expect(await page(`${path}/lessons/${second.id}`, 404)).toContain(GONE);
  });
});

describe('a compile view link', () => {
  it("live: shows the owner's sections citing the passage, and changes with them", async () => {
    const { account, section, revs } = await owner();
    const theirs = await owner();
    await pushOk(client, theirs.account, [
      upsert(
        'section',
        {
          ...theirs.section,
          body: bodyCiting({ ...ROMANS_8_28, translation: 'shared', snapshotText: 'THEIRS' }),
          updatedAt: LATER,
        },
        theirs.revs.get(theirs.section.id)!,
      ),
    ]);
    const path = await share(account, {
      targetType: 'compile',
      passage: { book: 'ROM', chapter: 8 },
      live: true,
    });
    const html = await page(path);
    expect(html).toContain('Commentary on Romans 8');
    expect(html).toContain('2 sections in 2 lessons');
    expect(html).toContain('More than conquerors · Sun 4 Oct 2026');
    expect(html).not.toContain('THEIRS');
    expect(html).not.toContain('As of');

    await pushOk(client, account, [
      upsert(
        'section',
        { ...section, body: bodyOf('No longer cited'), updatedAt: LATER },
        revs.get(section.id)!,
      ),
    ]);
    expect(await page(path)).toContain('1 section in 1 lesson');
  });

  it("frozen: shows the view as it was when made, whatever's edited after", async () => {
    const { account, section, revs } = await owner();
    const path = await share(account, {
      targetType: 'compile',
      passage: { book: 'ROM', chapter: 8 },
      live: false,
    });
    const before = await page(path);
    expect(before).toMatch(/As of \w+ \d+ \w+ \d{4}/);
    expect(before).toContain('2 sections in 2 lessons');
    await pushOk(client, account, [
      upsert(
        'section',
        { ...section, body: bodyOf('No longer cited'), updatedAt: LATER },
        revs.get(section.id)!,
      ),
    ]);
    await pickKjv(account.id);
    const after = await page(path);
    expect(after).toContain('2 sections in 2 lessons');
    // In the translation it was made in.
    expect(after).toContain('And we know that God works');
    expect(after).not.toContain('No longer cited');
  });
});

describe('a handout link', () => {
  it('shows the handout as its device sent it, with its Print script allowed by hash', async () => {
    const { account, shared } = await owner();
    const path = await share(account, {
      targetType: 'handout',
      targetId: shared.id,
      handout: HANDOUT,
    });
    const res = await client.get(path).expect(200);
    expect(res.text).toContain('<sup>11</sup>I am the good shepherd.');
    expect(res.text).toContain('data-print');
    expect(res.headers['content-security-policy']).toMatch(/script-src 'sha256-[^']+'/);
  });

  it("doesn't change after an edit, and goes when the lesson does", async () => {
    const { account, shared, revs } = await owner();
    const path = await share(account, {
      targetType: 'handout',
      targetId: shared.id,
      handout: HANDOUT,
    });
    const [renamed] = await pushOk(client, account, [
      upsert('lesson', { ...shared, title: 'Renamed', updatedAt: LATER }, revs.get(shared.id)!),
    ]);
    const html = await page(path);
    expect(html).toContain('<h1>The Good Shepherd</h1>');
    expect(html).not.toContain('Renamed');
    await pushOk(client, account, [remove('lesson', shared.id, (renamed as { rev: number }).rev)]);
    expect(await page(path, 404)).toContain(GONE);
  });
});
