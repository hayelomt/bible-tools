import {
  apiErrorSchema,
  ENTITY_NAMES,
  keyBetween,
  type MeResponse,
  meResponseSchema,
  MIN_CLIENT_VERSION,
  type PullResponse,
  pullResponseSchema,
  type PushRequest,
  type PushResponse,
  pushResponseSchema,
  type Section,
  type SectionBody,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { readdir, readFile } from 'node:fs/promises';
import { afterEach, describe, expect, inject, it } from 'vitest';
import {
  createLesson,
  deleteLesson,
  type LessonFields,
  updateLesson,
} from '@/data/actions/lessons.ts';
import {
  addInboxItem,
  dismissInboxItem,
  inboxItems,
  inboxItemTags,
  sendToLesson,
  snoozedCount,
  snoozeInboxItems,
  tagInboxItems,
} from '@/data/actions/inbox.ts';
import {
  addQuestion,
  parkQuestion,
  promoteQuestion,
  reopenQuestion,
} from '@/data/actions/questions.ts';
import {
  createSection,
  keepConflictedCopy,
  removeSection,
  updateSection,
} from '@/data/actions/sections.ts';
import { updateSettings } from '@/data/actions/settings.ts';
import { addTag, removeTag } from '@/data/actions/tags.ts';
import { createTemplate, templateByKey } from '@/data/actions/templates.ts';
import { lessonSections } from '@/data/queries.ts';
import { createTakeaway, updateTakeaway } from '@/data/actions/takeaways.ts';
import { LampDb, type RowEntity, SETTINGS_KEY, SYNC_STATE_KEY } from '@/data/db.ts';
import { linkedFrom } from '@/data/links.ts';
import { questionViews } from '@/data/question-status.ts';
import { ensureDevice } from '@/data/setup.ts';
import { ApiRequestError, NetworkError } from '@/lib/api.ts';
import { type SyncApi, SyncEngine } from './engine.ts';

declare module 'vitest' {
  interface ProvidedContext {
    apiOrigin: string;
  }
}

/**
 * The sync contract (TECH-DESIGN §10, M3-14): the web sync engine, on fake-indexeddb devices,
 * against a real API on lamp_test_dev (booted by the API's test:int, `test/int/api-server.ts`).
 * Devices edit offline, come back and sync until they settle; then every device, and a new one
 * that only pulls, holds the same rows, with exactly the conflicted copies the server made.
 */

const ORIGIN = inject('apiOrigin');
const EMAIL_DIR = new URL('../../../api/tmp/emails/', import.meta.url);
const RUN = Date.now().toString(36);
const PASSWORD = 'a lamp to my feet';
const ROW_ENTITIES = ENTITY_NAMES.filter((name): name is RowEntity => name !== 'userSettings');

let accounts = 0;
let databases = 0;
const devices: Device[] = [];

afterEach(async () => {
  for (const each of devices.splice(0)) await each.db.delete();
});

const body = (text: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const textOf = (section: Section | undefined) =>
  (section?.body.content?.[0]?.content?.[0] as { text?: string } | undefined)?.text;

/** The API over HTTP, as the browser calls it: the session cookie, and `Origin` on writes. */
class HttpApi implements SyncApi {
  online = true;
  token = '';
  /** Every push answered, for the conflicted copies the server made. */
  readonly answers: PushResponse[] = [];

  constructor(private readonly ip: string) {}

  async push(request: PushRequest): Promise<PushResponse> {
    const res = pushResponseSchema.parse(await this.call('POST', '/api/sync/push', request));
    this.answers.push(res);
    return res;
  }

  async pull(cursor: number, by: { deviceId: string; deviceName: string }): Promise<PullResponse> {
    const query = new URLSearchParams({
      cursor: `${cursor}`,
      clientVersion: MIN_CLIENT_VERSION,
      ...by,
    });
    return pullResponseSchema.parse(await this.call('GET', `/api/sync/pull?${query}`));
  }

  async call(method: 'GET' | 'POST', path: string, payload?: unknown): Promise<unknown> {
    if (!this.online) throw new NetworkError('offline');
    const headers = {
      // Each test's devices have their own address, so the per-IP sign-in limits never meet.
      'X-Forwarded-For': this.ip,
      ...(this.token ? { Cookie: `lamp_session=${this.token}` } : {}),
    };
    const res = await fetch(
      `${ORIGIN}${path}`,
      method === 'GET'
        ? { headers }
        : {
            method,
            headers: { ...headers, Origin: ORIGIN, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload ?? {}),
          },
    );
    const cookie = res.headers.getSetCookie().find((c) => c.startsWith('lamp_session='));
    if (cookie) this.token = cookie.slice('lamp_session='.length).split(';')[0]!;
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return json;
    const { errorCode, message } = apiErrorSchema.parse(json);
    throw new ApiRequestError(res.status, errorCode, message);
  }
}

/** A browser: its own database and engine, signed in to `account`. */
interface Device {
  name: string;
  db: LampDb;
  api: HttpApi;
  engine: SyncEngine;
}

async function device(name: string, ip: string): Promise<Device> {
  const db = new LampDb(`contract-${++databases}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
  const api = new HttpApi(ip);
  const engine = new SyncEngine({ db, api, deviceName: name, clientVersion: MIN_CLIENT_VERSION });
  const made = { name, db, api, engine };
  devices.push(made);
  return made;
}

/** Signs up on a new device and verifies the email from its link. */
async function signUp(name: string): Promise<{ email: string; first: Device }> {
  const email = `contract${++accounts}.${RUN}@example.com`;
  const first = await device(name, `198.51.100.${accounts % 250}`);
  await first.api.call('POST', '/api/auth/signup', { email, password: PASSWORD });
  await first.api.call('POST', '/api/auth/verify-email', { token: await tokenFor(email) });
  first.engine.setAccount(await me(first));
  return { email, first };
}

/** Signs in on another new device. */
async function signIn(email: string, name: string): Promise<Device> {
  const made = await device(name, `198.51.100.${accounts % 250}`);
  await made.api.call('POST', '/api/auth/login', { email, password: PASSWORD });
  made.engine.setAccount(await me(made));
  return made;
}

const me = async (on: Device): Promise<MeResponse> =>
  meResponseSchema.parse(await on.api.call('GET', '/api/auth/me'));

/** The token in the verification link the API wrote to `apps/api/tmp/emails`. */
async function tokenFor(email: string): Promise<string> {
  const files = (await readdir(EMAIL_DIR)).filter((f) => f.includes(`-${email}-`)).toSorted();
  const eml = await readFile(new URL(files.at(-1)!, EMAIL_DIR), 'utf8');
  const token = /\/verify-email\?token=([\w-]{43})/.exec(eml)?.[1];
  if (!token) throw new Error(`No verification link for ${email}`);
  return token;
}

/** One sync; a device that's offline only finds out. */
async function sync(on: Device): Promise<void> {
  await on.engine.syncNow();
  expect(on.engine.getStatus().phase).toBe(on.api.online ? 'synced' : 'offline');
}

/**
 * Syncs each device in turn until none has anything to push and all have pulled the same rev.
 * A tag two devices made offline takes a round more: refused, then matched by name (§6.6).
 */
async function settle(...all: Device[]): Promise<void> {
  for (const each of all) each.api.online = true;
  for (let round = 0; round < 5; round++) {
    for (const each of all) await sync(each);
    const outboxes = await Promise.all(all.map((each) => each.db.outbox.toArray()));
    const cursors = await Promise.all(all.map(async (each) => (await state(each)).cursor));
    if (outboxes.every((o) => o.length === 0) && new Set(cursors).size === 1) return;
  }
  const left = await Promise.all(all.map((each) => each.db.outbox.toArray()));
  throw new Error(`The devices never settled; still queued: ${JSON.stringify(left)}`);
}

const state = async (on: Device) => (await on.db.syncState.get(SYNC_STATE_KEY))!;

/**
 * Everything a device holds that syncs: every row, tombstones too, and the citations and links
 * derived from them (their ids are the device's own).
 */
async function snapshot(on: Device) {
  const rows: Record<string, unknown> = {};
  for (const entity of ROW_ENTITIES) {
    rows[entity] = (await on.db.rows(entity).toArray()).toSorted((a, b) =>
      a.id.localeCompare(b.id),
    );
  }
  rows.userSettings = await on.db.userSettings.get(SETTINGS_KEY);
  rows.citation = (await on.db.citation.toArray())
    .map(({ id: _id, ...citation }) => JSON.stringify(citation))
    .toSorted();
  rows.link = (await on.db.link.toArray())
    .map(({ id: _id, ...link }) => JSON.stringify(link))
    .toSorted();
  return rows;
}

/** Every device holds the same, and so does a new device that signs in and pulls. */
async function expectIdentical(email: string, ...all: Device[]): Promise<void> {
  const fresh = await signIn(email, 'Chrome on Android');
  await sync(fresh);
  const [first, ...rest] = await Promise.all([...all, fresh].map(snapshot));
  for (const other of rest) expect(other).toEqual(first);
}

/** The copies the server said it made, from every push any device sent. */
const copiesMade = (...all: Device[]) =>
  new Set(
    all.flatMap((each) =>
      each.api.answers.flatMap(({ results }) =>
        results.flatMap((r) => (r.status === 'conflict' && r.copyId ? [r.copyId] : [])),
      ),
    ),
  );

const live = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((row) => row.deletedAt === null);

const LESSON: Omit<LessonFields, 'title'> = {
  seriesId: null,
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
};

const newSection = (lessonId: string, orderKey: string, text: string, parentId = null) => ({
  lessonId,
  parentId,
  orderKey,
  body: body(text),
  conflictOf: null,
  conflictDevice: null,
  sourceAt: null,
  sourcePage: null,
});

/** Lets the clock move on, so the later of two edits is later by `updatedAt` too. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('two devices editing offline', () => {
  it('end up identical, with the conflicted copy the server made', async () => {
    const { email, first: laptop } = await signUp('Firefox on macOS');
    const lesson = await createLesson({ ...LESSON, title: 'The Good Shepherd' }, laptop.db);
    const door = await createSection(newSection(lesson.id, 'a0', 'I am the door'), laptop.db);
    const shepherd = await createSection(
      newSection(lesson.id, 'a1', 'I am the good shepherd'),
      laptop.db,
    );
    const psalm = await createLesson({ ...LESSON, title: 'Psalm 23' }, laptop.db);
    await sync(laptop);
    const phone = await signIn(email, 'Safari on iOS');
    await sync(phone);
    expect(await phone.db.section.get(door.id)).toEqual(await laptop.db.section.get(door.id));

    laptop.api.online = false;
    phone.api.online = false;
    // The laptop: one body typed, the title changed, a section and a lesson deleted, a tag.
    await updateSection(door.id, { body: body('typed on the laptop') }, laptop.db);
    await updateLesson(lesson.id, { title: 'The Door' }, laptop.db);
    await removeSection(shepherd.id, {}, laptop.db);
    await deleteLesson(psalm.id, laptop.db);
    await addTag({ kind: 'section', id: door.id }, 'Shepherd', laptop.db);
    await updateSettings({ reviewWindowDays: 7 }, laptop.db);
    await tick();
    // The phone, later: the same body, another field, an edit to the deleted section, a section in
    // the deleted lesson, and the same tag in another case.
    await updateSection(door.id, { body: body('typed on the phone') }, phone.db);
    await updateLesson(lesson.id, { speaker: 'Pastor Ann' }, phone.db);
    await updateSection(shepherd.id, { body: body('edited on the phone') }, phone.db);
    const still = await createSection(
      newSection(psalm.id, 'a0', 'The Lord is my shepherd'),
      phone.db,
    );
    await addTag({ kind: 'section', id: door.id }, 'shepherd', phone.db);
    await updateSettings(
      { autoPreviewVerses: true, pasteChips: false, openInTargets: ['logos', 'youversion'] },
      phone.db,
    );
    await sync(laptop);
    await sync(phone);

    await settle(laptop, phone);
    await expectIdentical(email, laptop, phone);

    const { db } = laptop;
    // Both fields kept; the later body on the section, the earlier one in a copy from the laptop.
    expect(await db.lesson.get(lesson.id)).toMatchObject({
      title: 'The Door',
      speaker: 'Pastor Ann',
    });
    expect(textOf(await db.section.get(door.id))).toBe('typed on the phone');
    const copies = await db.section.where('conflictOf').equals(door.id).toArray();
    expect(copies).toHaveLength(1);
    expect(copies[0]).toMatchObject({
      lessonId: lesson.id,
      conflictDevice: 'Firefox on macOS',
      deletedAt: null,
    });
    expect(textOf(copies[0])).toBe('typed on the laptop');
    expect(copiesMade(laptop, phone)).toEqual(new Set([copies[0]!.id]));
    // An edit wins over a delete; a new section brings its deleted lesson back.
    expect(await db.section.get(shepherd.id)).toMatchObject({ deletedAt: null });
    expect(textOf(await db.section.get(shepherd.id))).toBe('edited on the phone');
    expect(await db.lesson.get(psalm.id)).toMatchObject({ deletedAt: null });
    expect(await db.section.get(still.id)).toMatchObject({ deletedAt: null });
    // One tag of that name, on the section once.
    const tags = live(await db.tag.toArray()).filter((t) => t.name.toLowerCase() === 'shepherd');
    expect(tags).toHaveLength(1);
    expect(live(await db.sectionTag.where('sectionId').equals(door.id).toArray())).toEqual([
      expect.objectContaining({ tagId: tags[0]!.id }),
    ]);
    expect(await db.userSettings.get(SETTINGS_KEY)).toMatchObject({
      reviewWindowDays: 7,
      autoPreviewVerses: true,
      pasteChips: false,
      openInTargets: ['logos', 'youversion'],
    });
  });
});

describe('the inbox on two devices', () => {
  it('syncs its items, and where one was placed, to both and to a new device', async () => {
    const { email, first: phone } = await signUp('Safari on iOS');
    const shared = await addInboxItem(
      {
        origin: 'share',
        ref: {
          book: 'JHN',
          chapter: 10,
          verseStart: 11,
          display: 'John 10:11',
          translation: 'BSB',
          snapshotText: 'I am the good shepherd.',
        },
        text: null,
        sourceUrl: 'https://www.bible.com/bible/3034/JHN.10.11.BSB',
      },
      phone.db,
    );
    const note = await addInboxItem(
      { origin: 'typed', ref: null, text: 'Look up hesed' },
      phone.db,
    );
    // Settings sync once changed; until then each device keeps its own defaults.
    await updateSettings({ reviewWindowDays: 7 }, phone.db);
    await sync(phone);
    const laptop = await signIn(email, 'Firefox on macOS');
    await sync(laptop);
    expect(await laptop.db.inboxItem.get(shared.id)).toEqual(
      await phone.db.inboxItem.get(shared.id),
    );

    // Offline: the laptop sends the verse to a lesson, the phone dismisses the note.
    laptop.api.online = false;
    phone.api.online = false;
    const lesson = await createLesson({ ...LESSON, title: 'The Good Shepherd' }, laptop.db);
    const placement = await sendToLesson([shared.id], { lessonId: lesson.id }, laptop.db);
    const { section } = placement.placed[0]!;
    await dismissInboxItem(note.id, phone.db);

    await settle(laptop, phone);
    await expectIdentical(email, laptop, phone);
    expect(await phone.db.inboxItem.get(shared.id)).toMatchObject({
      placedInSectionId: section.id,
    });
    expect(await inboxItems('2026-10-17', phone.db)).toEqual([]);
    // The placed section is cited like any other; the item never was.
    expect(await phone.db.citation.where('sourceId').equals(section.id).count()).toBe(1);
    expect(await phone.db.citation.where('sourceId').anyOf(shared.id, note.id).count()).toBe(0);
  });

  it('snoozes and tags an item on one device, and the other hides it and shows the tag', async () => {
    const { email, first: phone } = await signUp('Safari on iOS');
    const item = await addInboxItem({ origin: 'typed', ref: null, text: 'hesed' }, phone.db);
    await updateSettings({ reviewWindowDays: 7 }, phone.db);
    await sync(phone);
    const laptop = await signIn(email, 'Firefox on macOS');
    await sync(laptop);

    await snoozeInboxItems([item.id], '2026-10-26', laptop.db);
    await tagInboxItems([item.id], 'word study', laptop.db);
    await settle(laptop, phone);
    await expectIdentical(email, laptop, phone);
    // Hidden until its day on the other device too.
    expect(await inboxItems('2026-10-19', phone.db)).toEqual([]);
    expect(await snoozedCount('2026-10-19', phone.db)).toBe(1);
    expect((await inboxItems('2026-10-26', phone.db)).map((i) => i.id)).toEqual([item.id]);
    expect((await inboxItemTags([item.id], phone.db)).get(item.id)?.map((t) => t.name)).toEqual([
      'word study',
    ]);
  });
});

describe('a question on two devices', () => {
  it('keeps the entries each made offline, and both give it the same status', async () => {
    const { email, first: laptop } = await signUp('Firefox on macOS');
    const lesson = await createLesson({ ...LESSON, title: 'The Good Shepherd' }, laptop.db);
    const question = await addQuestion(lesson.id, 'Who are the other sheep?', laptop.db);
    // Settings sync once changed; until then each device keeps its own defaults.
    await updateSettings({ reviewWindowDays: 7 }, laptop.db);
    await sync(laptop);
    const phone = await signIn(email, 'Safari on iOS');
    await sync(phone);

    // Offline: the laptop parks it, then the phone answers it, a moment later.
    laptop.api.online = false;
    phone.api.online = false;
    await parkQuestion(question.id, laptop.db);
    await tick();
    const answer = await promoteQuestion(question.id, undefined, phone.db);
    await updateSection(
      answer.id,
      {
        body: {
          type: 'doc',
          content: [
            ...answer.body.content.slice(0, 1),
            { type: 'paragraph', content: [{ type: 'text', text: 'The Gentiles.' }] },
          ],
        },
      },
      phone.db,
    );

    await settle(laptop, phone);
    await expectIdentical(email, laptop, phone);
    const view = async (on: Device) =>
      (await questionViews([(await on.db.question.get(question.id))!], on.db))[0]!;
    for (const on of [laptop, phone]) {
      expect((await view(on)).entries.map((e) => e.kind)).toEqual(['asked', 'parked', 'answered']);
      expect(await view(on)).toMatchObject({ status: 'answered', answerSectionId: answer.id });
    }

    // Reopened on the laptop: open on both.
    await reopenQuestion(question.id, laptop.db);
    await settle(laptop, phone);
    expect((await view(phone)).status).toBe('open');
    await expectIdentical(email, laptop, phone);
  });
});

describe('templates on two devices', () => {
  it('a template made on one is a new lesson’s default on the other', async () => {
    const { email, first: laptop } = await signUp('Firefox on macOS');
    const notes = await createTemplate(
      {
        name: 'Sermon notes',
        structure: [
          { title: 'Main point' },
          { title: 'Points', children: [{ title: 'One' }] },
          { title: 'Response' },
        ],
      },
      laptop.db,
    );
    await updateSettings(
      { defaultTemplates: { sermon: notes.id, personal: 'builtin:soap', group: null } },
      laptop.db,
    );
    await sync(laptop);
    const phone = await signIn(email, 'Safari on iOS');
    await sync(phone);

    expect(await templateByKey(notes.id, phone.db)).toMatchObject({ name: 'Sermon notes' });
    const lesson = await createLesson({ ...LESSON, title: 'Romans 8' }, phone.db);
    const sections = await lessonSections(lesson.id, phone.db);
    expect(sections.filter((s) => s.parentId === null)).toHaveLength(3);
    expect(sections.filter((s) => s.parentId !== null)).toHaveLength(1);

    await settle(laptop, phone);
    await expectIdentical(email, laptop, phone);
  });
});

describe('links on two devices', () => {
  it('show under what they link to on the other device, and go when removed', async () => {
    const { email, first: laptop } = await signUp('Firefox on macOS');
    const shepherd = await createLesson({ ...LESSON, title: 'The Good Shepherd' }, laptop.db);
    const lazarus = await createLesson({ ...LESSON, title: 'Lazarus' }, laptop.db);
    await updateSettings({ reviewWindowDays: 7 }, laptop.db);
    const phone = await signIn(email, 'Safari on iOS');
    await settle(laptop, phone);

    const linking: SectionBody = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Same idea as ' },
            {
              type: 'noteLink',
              attrs: { targetType: 'lesson', targetId: shepherd.id, label: 'The Good Shepherd' },
            },
          ],
        },
      ],
    };
    const section = await createSection(
      { ...newSection(lazarus.id, keyBetween(null, null), ''), body: linking },
      laptop.db,
    );
    await settle(laptop, phone);
    const from = async (on: Device) =>
      (await linkedFrom({ kind: 'lesson', id: shepherd.id }, on.db)).map((b) => b.section.id);
    expect(await from(phone)).toEqual([section.id]);
    await expectIdentical(email, laptop, phone);

    await updateSection(section.id, { body: body('Same idea.') }, laptop.db);
    await settle(laptop, phone);
    expect(await from(phone)).toEqual([]);
    await expectIdentical(email, laptop, phone);
  });
});

/** mulberry32: a small seeded generator, so a failing run can be replayed from its seed. */
function random(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (n: number) => Math.floor(next() * n);
  const pick = <T>(items: readonly T[]): T | undefined => items[int(items.length)];
  return { next, int, pick };
}

type Random = ReturnType<typeof random>;

/** Replay a failure by putting its seed (in the test's name) here. */
const SEED = Math.floor(Math.random() * 2 ** 31);
const OPERATIONS = 200;
const TAG_NAMES = ['grace', 'Grace', 'hope', 'faith', 'Prayer'];

/**
 * One random thing a user does on the device, to its own live rows: write, edit, move or delete
 * lessons, sections, tags, takeaways, questions and settings, keep a conflicted copy, go offline
 * or online, or sync. Returns what it did, for the failure message.
 */
async function step(on: Device, rng: Random, n: number): Promise<string> {
  const { db } = on;
  const lessons = live(await db.lesson.toArray());
  const sections = live(await db.section.toArray());
  const lesson = rng.pick(lessons);
  const section = rng.pick(sections);
  const roll = rng.int(16);
  if (roll === 0 || !lesson) {
    await createLesson({ ...LESSON, title: `Lesson ${n}` }, db);
    return 'create a lesson';
  }
  if (roll === 1) {
    await updateLesson(lesson.id, { title: `Renamed ${n}` }, db);
    return 'rename a lesson';
  }
  if (roll === 2 && rng.int(3) === 0) {
    await deleteLesson(lesson.id, db);
    return 'delete a lesson';
  }
  if (roll <= 4 || !section) {
    // A section at the end of the lesson, or a reply at the end of another section's replies.
    const parent = rng.int(3) === 0 ? sections.find((s) => s.lessonId === lesson.id) : undefined;
    const siblings = sections.filter(
      (s) => s.lessonId === lesson.id && s.parentId === (parent?.id ?? null),
    );
    const last =
      siblings
        .map((s) => s.orderKey)
        .toSorted()
        .at(-1) ?? null;
    await createSection(
      {
        ...newSection(lesson.id, keyBetween(last, null), `Section ${n}`),
        parentId: parent?.id ?? null,
      },
      db,
    );
    return 'create a section';
  }
  if (roll <= 7) {
    await updateSection(section.id, { body: body(`Typed ${n} on ${on.name}`) }, db);
    return 'type in a section';
  }
  if (roll === 8) {
    // To the front of its siblings: a move both devices may make at once.
    const first = sections
      .filter((s) => s.lessonId === section.lessonId && s.parentId === section.parentId)
      .map((s) => s.orderKey)
      .toSorted()[0];
    await updateSection(section.id, { orderKey: keyBetween(null, first) }, db);
    return 'move a section';
  }
  if (roll === 9) {
    await removeSection(section.id, { withReplies: true }, db);
    return 'delete a section';
  }
  if (roll === 10) {
    const target =
      rng.int(2) === 0
        ? { kind: 'section' as const, id: section.id }
        : { kind: 'lesson' as const, id: lesson.id };
    await addTag(target, rng.pick(TAG_NAMES)!, db);
    return `tag a ${target.kind}`;
  }
  if (roll === 11) {
    const links = [
      ...live(await db.sectionTag.toArray()).map((l) => ({
        entity: 'sectionTag' as const,
        id: l.id,
      })),
      ...live(await db.lessonTag.toArray()).map((l) => ({
        entity: 'lessonTag' as const,
        id: l.id,
      })),
    ];
    const link = rng.pick(links);
    if (!link) return 'nothing to untag';
    await removeTag(link, db);
    return 'untag';
  }
  if (roll === 12) {
    const takeaway = rng.pick(live(await db.takeaway.toArray()));
    if (takeaway && rng.int(2) === 0) {
      await updateTakeaway(takeaway.id, `Takeaway ${n}, edited`, db);
      return 'edit a takeaway';
    }
    await createTakeaway({ lessonId: lesson.id, text: `Takeaway ${n}` }, db);
    return 'add a takeaway';
  }
  if (roll === 13) {
    if (rng.int(2) === 0) {
      await addQuestion(lesson.id, `Question ${n}?`, db);
      return 'ask a question';
    }
    await updateSettings({ reviewWindowDays: 1 + rng.int(30) }, db);
    return 'change a setting';
  }
  if (roll === 14) {
    const copy = rng.pick(sections.filter((s) => s.conflictOf !== null));
    if (copy) {
      await keepConflictedCopy(copy.id, db);
      return 'keep a conflicted copy';
    }
    on.api.online = !on.api.online;
    return on.api.online ? 'go online' : 'go offline';
  }
  await sync(on);
  return 'sync';
}

describe(`${OPERATIONS} random operations on two devices (seed ${SEED})`, () => {
  it('settle to the same rows, with exactly the conflicted copies the server made', async () => {
    const rng = random(SEED);
    const { email, first: laptop } = await signUp('Firefox on macOS');
    const phone = await signIn(email, 'Safari on iOS');
    const done: string[] = [];
    try {
      for (let n = 1; n <= OPERATIONS; n++) {
        const on = rng.int(2) === 0 ? laptop : phone;
        done.push(`${n}. ${on.name}: ${await step(on, rng, n)}`);
      }
      await settle(laptop, phone);
      await expectIdentical(email, laptop, phone);
    } catch (error) {
      throw new Error(`Seed ${SEED}, after:\n${done.slice(-20).join('\n')}`, { cause: error });
    }

    // Every copy on the devices is one the server made, and every copy it made reached them.
    const made = copiesMade(laptop, phone);
    const copies = (await laptop.db.section.toArray()).filter((s) => s.conflictOf !== null);
    for (const copy of copies) expect(made).toContain(copy.id);
    for (const id of made) expect(await laptop.db.section.get(id)).toBeDefined();
  });
});
