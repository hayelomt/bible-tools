import { expect, type Locator, type Page, type Route, test } from '@playwright/test';
import { newLesson, rows } from './helpers.ts';

// Every sync state (wireframes/sync.md) against a mocked API: the account and the sync endpoints
// are answered here, so no server state is needed. A laptop, so the status is in the sidebar and
// the panel is a popover.

const ACCOUNT = {
  id: '019a0000-0000-7000-8000-000000000001',
  email: 'reader@example.com',
  emailVerifiedAt: '2026-10-01T00:00:00.000Z',
  role: 'user',
};
const UNVERIFIED = { ...ACCOUNT, emailVerifiedAt: null };

type Reply = { status: number; json?: unknown } | 'offline' | 'hold';
interface Change {
  changeId: string;
  entity: string;
}

/** The API as the tests want it: change the handlers between steps. */
class FakeApi {
  me: object | null = ACCOUNT;
  pull: (cursor: number) => Reply = (cursor) => ({ status: 200, json: page([], cursor) });
  push: (changes: Change[]) => Reply = (changes) => ({ status: 200, json: applied(changes) });
  pushed: Change[] = [];
  pulls = 0;

  async install(target: Page) {
    await target.route('**/api/auth/me', (route) =>
      this.me ? route.fulfill({ json: this.me }) : route.fulfill(error(401, 'UNAUTHORIZED')),
    );
    await target.route('**/api/sync/pull?*', (route) => {
      this.pulls += 1;
      const cursor = Number(new URL(route.request().url()).searchParams.get('cursor'));
      return answer(route, this.pull(cursor));
    });
    await target.route('**/api/account/devices', (route) =>
      route.fulfill({ json: { devices: [device('Chrome on Windows'), device('Safari on iOS')] } }),
    );
    await target.route('**/api/sync/push', (route) => {
      const { changes } = route.request().postDataJSON() as { changes: Change[] };
      this.pushed.push(...changes);
      return answer(route, this.push(changes));
    });
  }
}

let devices = 0;
const device = (name: string) => ({
  id: `019a0000-0000-7000-8000-0000000002${String(++devices).padStart(2, '0')}`,
  name,
  clientVersion: '0.0.0',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastSyncAt: new Date().toISOString(),
});

let rev = 100;
const page = (rowsOut: object[], cursor: number, extra: object = {}) => ({
  rows: rowsOut,
  nextCursor: cursor + rowsOut.length,
  hasMore: false,
  remaining: rowsOut.length,
  serverTime: new Date().toISOString(),
  minClientVersion: '0.0.0',
  groups: [],
  ...extra,
});
const applied = (changes: Change[]) => ({
  results: changes.map((c) => ({ changeId: c.changeId, status: 'applied', rev: ++rev })),
});
const error = (status: number, errorCode: string) => ({
  status,
  json: { statusCode: status, errorCode, message: errorCode },
});

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

function answer(route: Route, reply: Reply) {
  if (reply === 'offline') return route.abort('internetdisconnected');
  if (reply === 'hold') return new Promise<void>(() => {});
  return route.fulfill(reply);
}

/** The status line in the sidebar. */
const status = (target: Page) => target.getByRole('complementary').getByRole('status');

/** Opens the sync panel from the sidebar. */
async function openPanel(target: Page): Promise<Locator> {
  await target
    .getByRole('complementary')
    .getByRole('button', { name: /^Sync:/ })
    .click();
  const panel = target.getByRole('dialog', { name: 'Sync' });
  await expect(panel).toBeVisible();
  return panel;
}

let api: FakeApi;

test.use({ viewport: { width: 1280, height: 800 } });

test.beforeEach(async ({ page: p }) => {
  api = new FakeApi();
  await api.install(p);
});

test('a guest: on this device, with nothing to do', async ({ page: p }) => {
  api.me = null;
  await p.goto('/');
  await expect(status(p)).toHaveText('On this device');
  const panel = await openPanel(p);
  await expect(panel.getByText('Your notes are saved in this browser only.')).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Sync now' })).toHaveCount(0);
  expect(api.pulls).toBe(0);
});

test('synced, and Sync now', async ({ page: p }) => {
  await p.goto('/');
  await expect(status(p)).toHaveText('Synced');
  const panel = await openPanel(p);
  await expect(panel.getByText('Synced just now')).toBeVisible();
  await expect(panel.getByText('r•••@example.com · 2 devices')).toBeVisible();
  const before = api.pulls;
  await panel.getByRole('button', { name: 'Sync now' }).click();
  await expect.poll(() => api.pulls).toBeGreaterThan(before);
});

test('offline with changes waiting, then back', async ({ page: p }) => {
  await p.goto('/');
  await expect(status(p)).toHaveText('Synced');
  // The server can't be reached. (The browser stays online: without a service worker, the
  // lesson screen's code wouldn't load; offline.spec.ts covers airplane mode.)
  api.push = () => 'offline';
  api.pull = () => 'offline';
  await newLesson(p, 'Written offline');
  await expect(status(p)).toHaveText('Offline · 1 waiting');
  const panel = await openPanel(p);
  await expect(
    panel.getByText(
      /^1 change is saved on this device and will sync when you're online\. Last synced today at \d\d:\d\d\.$/,
    ),
  ).toBeVisible();

  const back = new FakeApi();
  api.push = back.push;
  api.pull = back.pull;
  await panel.getByRole('button', { name: 'Sync now' }).click();
  await expect(status(p)).toHaveText('Synced');
  expect(api.pushed.some((c) => c.entity === 'lesson')).toBe(true);
});

test('verify your email, and resend it', async ({ page: p }) => {
  api.me = UNVERIFIED;
  await p.route('**/api/auth/resend-verification', (route) => route.fulfill({ status: 204 }));
  await p.goto('/');
  await expect(status(p)).toHaveText('Verify your email');
  const panel = await openPanel(p);
  await expect(panel.getByText(/Open the link we sent to r•••@example\.com/)).toBeVisible();
  await panel.getByRole('button', { name: 'Resend email' }).click();
  await expect(panel.getByText('Sent. Check your inbox.')).toBeVisible();
  expect(api.pulls).toBe(0);
});

test('signed out when the session ends: sign in to sync', async ({ page: p }) => {
  await p.goto('/');
  await expect(status(p)).toHaveText('Synced');
  api.me = null;
  api.pull = () => error(401, 'UNAUTHORIZED');
  const panel = await openPanel(p);
  await panel.getByRole('button', { name: 'Sync now' }).click();
  await expect(status(p)).toHaveText('Sign in to sync');
  await expect(panel.getByText('Your notes are safe on this device.')).toBeVisible();
  await panel.getByRole('link', { name: 'Sign in' }).click();
  await expect(p).toHaveURL(/\/signin$/);
});

test('update required (426): reload to update', async ({ page: p }) => {
  api.pull = () => error(426, 'UPGRADE_REQUIRED');
  await p.goto('/');
  await expect(status(p)).toHaveText('Update Lamp');
  const panel = await openPanel(p);
  await expect(panel.getByText("This version of Lamp can't sync any more.")).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Reload to update' })).toBeVisible();
});

test('a refused change: what, why, and Discard', async ({ page: p }) => {
  api.push = (changes) => ({
    status: 200,
    json: {
      results: changes.map((c) =>
        c.entity === 'lesson'
          ? {
              changeId: c.changeId,
              status: 'rejected',
              errorCode: 'INVALID_CHANGE',
              message: 'row.title: Too big',
            }
          : { changeId: c.changeId, status: 'applied', rev: ++rev },
      ),
    },
  });
  await p.goto('/');
  await newLesson(p, 'Refused');
  await expect(status(p)).toHaveText('Sync problem');
  const panel = await openPanel(p);
  await expect(panel.getByText("1 change couldn't sync")).toBeVisible();
  await expect(panel.getByText('Lesson "Refused"')).toBeVisible();
  await expect(
    panel.getByText("The server refused it: something in it isn't valid."),
  ).toBeVisible();
  await expect(panel.getByText('INVALID_CHANGE: row.title: Too big')).toBeVisible();

  // The server never had it, so discarding it removes it from the device.
  await panel.getByRole('button', { name: 'Discard' }).click();
  await expect(status(p)).toHaveText('Synced');
  await expect.poll(async () => (await rows(p, 'lesson')).length).toBe(0);
});

test("a clock that's off by more than 5 minutes is pointed out", async ({ page: p }) => {
  const ahead = 12 * 60_000;
  api.pull = (cursor) => ({
    status: 200,
    json: page([], cursor, { serverTime: new Date(Date.now() + ahead).toISOString() }),
  });
  await p.goto('/');
  await expect(status(p)).toHaveText('Synced');
  const panel = await openPanel(p);
  await expect(
    panel.getByText("This device's clock is 12 minutes off.", { exact: false }),
  ).toBeVisible();
});

test('the first sync on a new device shows its progress', async ({ page: p }) => {
  const time = new Date().toISOString();
  const tag = (n: number) => ({
    entity: 'tag',
    row: {
      id: `019a0000-0000-7000-8000-0000000000${10 + n}`,
      name: `Account tag ${n}`,
      isSeeded: false,
      createdAt: time,
      updatedAt: time,
      rev: n,
      deletedAt: null,
    },
  });
  api.pull = (cursor) =>
    cursor === 0
      ? { status: 200, json: page([tag(1), tag(2)], 0, { hasMore: true, remaining: 3000 }) }
      : 'hold';
  await p.goto('/');
  await expect(status(p)).toHaveText('Syncing…');
  const panel = await openPanel(p);
  await expect(panel.getByText('Getting your notes…')).toBeVisible();
  await expect(panel.getByText('2 of 3,000')).toBeVisible();
  await expect(panel.getByText('You can keep working meanwhile.')).toBeVisible();
});

test('a conflicted copy: labelled, counted, and kept instead', async ({ page: p }) => {
  const time = '2026-10-13T08:41:00.000Z';
  const lessonId = '019a0000-0000-7000-8000-000000000101';
  const synced = { createdAt: time, updatedAt: time, deletedAt: null };
  const section = (id: string, orderKey: string, text: string, copy: boolean, at: number) => ({
    entity: 'section',
    row: {
      id,
      lessonId,
      parentId: null,
      orderKey,
      body: doc(text),
      conflictOf: copy ? '019a0000-0000-7000-8000-000000000102' : null,
      conflictDevice: copy ? 'Firefox on macOS' : null,
      sourceAt: null,
      sourcePage: null,
      ...synced,
      rev: at,
    },
  });
  const pulled = [
    {
      entity: 'lesson',
      row: {
        id: lessonId,
        seriesId: null,
        title: 'The Good Shepherd',
        date: '2026-10-11',
        kind: 'sermon',
        speaker: null,
        church: null,
        sourceType: null,
        sourceTitle: null,
        sourceAuthor: null,
        sourceUrl: null,
        sourceStartedAt: null,
        mainPassages: [],
        ...synced,
        rev: 1,
      },
    },
    section('019a0000-0000-7000-8000-000000000102', 'a0', 'Jesus is the door', false, 2),
    section('019a0000-0000-7000-8000-000000000103', 'a1', 'Jesus is the gate', true, 2),
  ];
  api.pull = (cursor) => ({ status: 200, json: page(cursor === 0 ? pulled : [], cursor) });
  await p.goto('/');
  await expect(p.getByText('1 conflicted copy')).toBeVisible();

  await p.getByRole('link', { name: /The Good Shepherd/ }).click();
  const copy = p.getByRole('group', { name: /^Conflicted copy · Firefox on macOS · / });
  await expect(copy.getByText('Jesus is the gate')).toBeVisible();
  await copy.getByRole('button', { name: 'Keep this instead' }).click();
  await expect(copy).toHaveCount(0);
  await expect(p.getByRole('textbox', { name: 'Note' }).first()).toHaveText('Jesus is the gate');
  // One action: the section's new text and the copy's delete both sync.
  await expect
    .poll(() => api.pushed.filter((c) => c.entity === 'section').length)
    .toBeGreaterThanOrEqual(2);
  await p.getByRole('link', { name: 'Lessons' }).first().click();
  await expect(p.getByText('1 conflicted copy')).toHaveCount(0);
});
