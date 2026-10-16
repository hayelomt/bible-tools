import { newId, type PushResult } from '@lamp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import * as sync from './int/sync.js';
import {
  type Account,
  bodyCiting,
  bodyOf,
  EARLIER,
  JOHN_3_16,
  LATER,
  lessonRow,
  NOW,
  type Row,
  remove,
  sectionRow,
  upsert,
} from './int/sync.js';

/**
 * The §6.4 conflict rules through `POST /api/sync/push`, one account on two devices: the laptop
 * pushes first, then the phone pushes a change built on the same revision.
 */

let t: TestApp;
let client: Client;
let account: Account;

const LATEST = '2026-10-13T12:00:00.000Z';
/** What the phone types in the section bodies below: text and a chip for John 3:16. */
const PHONE_BODY = bodyCiting(JOHN_3_16);

const settingsChange = (row: object, baseRev: number, changed?: string[]) => ({
  changeId: newId(),
  baseRev,
  clientTime: NOW,
  entity: 'userSettings',
  op: 'upsert',
  row,
  ...(changed ? { changed } : {}),
});

beforeAll(async () => {
  t = await createTestApp();
});

afterAll(async () => {
  await t.app.close();
});

beforeEach(async () => {
  await truncateAll(t.prisma);
  client = await createClient(t);
  account = await sync.signUp(t, client);
});

async function pushOne(change: object, deviceName?: string): Promise<PushResult> {
  const [result] = await sync.pushOk(client, account, [change], deviceName);
  return result!;
}

/** A lesson (rev 1) with one section (rev 2) on the server, as both devices last saw them. */
async function lessonWithSection(sectionFields: object = {}) {
  const lesson = lessonRow();
  const section = sectionRow(lesson.id, { body: bodyOf('base'), ...sectionFields });
  await sync.pushOk(client, account, [upsert('lesson', lesson), upsert('section', section)]);
  return { lesson, section };
}

const storedSection = (id: string) => t.prisma.section.findUniqueOrThrow({ where: { id } });
const sectionsOf = (lessonId: string) =>
  t.prisma.section.findMany({ where: { lessonId }, orderBy: { orderKey: 'asc' } });

describe('both sides changed a row: last write wins by updatedAt', () => {
  it('the later device wins, and only with the fields it edited', async () => {
    const lesson = lessonRow();
    await pushOne(upsert('lesson', lesson));
    await pushOne(upsert('lesson', { ...lesson, title: 'Laptop title', updatedAt: LATER }, 1));

    const phone = { ...lesson, speaker: 'Pastor Ann', updatedAt: LATEST };
    const result = await pushOne(upsert('lesson', phone, 1, ['speaker', 'updatedAt']));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'client-won', rev: 3 });
    const stored = await t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored).toMatchObject({
      title: 'Laptop title',
      speaker: 'Pastor Ann',
      updatedAt: new Date(LATEST),
      rev: 3n,
    });
  });

  it('an earlier device loses: the stored row stays, with a new rev so it is sent again', async () => {
    const lesson = lessonRow();
    await pushOne(upsert('lesson', lesson));
    await pushOne(upsert('lesson', { ...lesson, title: 'Laptop title', updatedAt: LATER }, 1));

    const phone = { ...lesson, title: 'Phone title', updatedAt: NOW };
    const result = await pushOne(upsert('lesson', phone, 1, ['title', 'updatedAt']));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'server-won', rev: 3 });
    const stored = await t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored).toMatchObject({ title: 'Laptop title', updatedAt: new Date(LATER), rev: 3n });
  });

  it('applies to settings', async () => {
    const settings = {
      colorMode: 'system',
      defaultTranslation: 'BSB',
      reviewWindowDays: 14,
      autoPreviewVerses: false,
      updatedAt: NOW,
    };
    await pushOne(settingsChange(settings, 0));
    await pushOne(
      settingsChange({ ...settings, colorMode: 'dark', updatedAt: LATER }, 1, ['colorMode']),
    );
    const result = await pushOne(
      settingsChange({ ...settings, reviewWindowDays: 7, updatedAt: LATEST }, 1, [
        'reviewWindowDays',
      ]),
    );
    expect(result).toMatchObject({ status: 'conflict', resolution: 'client-won' });
    const stored = await t.prisma.userSettings.findUniqueOrThrow({ where: { userId: account.id } });
    expect(stored).toMatchObject({ colorMode: 'dark', reviewWindowDays: 7, rev: 3n });
  });
});

/** The laptop and then the phone type into the same section, the phone's write dated `phoneTime`. */
async function bothTyped(phoneTime: string) {
  const { lesson, section } = await lessonWithSection({ orderKey: 'a0' });
  const next = sectionRow(lesson.id, { orderKey: 'a1', body: bodyOf('next') });
  await pushOne(upsert('section', next)); // rev 3
  const laptop = { ...section, body: bodyOf('typed on the laptop'), updatedAt: LATER };
  await pushOne(upsert('section', laptop, 2, ['body', 'updatedAt']), 'Firefox on macOS'); // rev 4
  const phone = { ...section, body: PHONE_BODY, updatedAt: phoneTime };
  const result = await pushOne(upsert('section', phone, 2, ['body', 'updatedAt']));
  return { lesson, section, next, result };
}

describe('a section body changed on both sides', () => {
  it('the newer body stays and the older becomes a copy right after it (phone later)', async () => {
    const { lesson, section, next, result } = await bothTyped(LATEST);
    expect(result).toMatchObject({ status: 'conflict', resolution: 'conflicted-copy', rev: 5 });
    const copyId = (result as { copyId?: string }).copyId;
    expect(copyId).toEqual(expect.any(String));

    const rows = await sectionsOf(lesson.id);
    expect(rows.map((r) => r.id)).toEqual([section.id, copyId, next.id]);
    expect(rows[0]).toMatchObject({
      body: PHONE_BODY,
      rev: 5n,
      conflictOf: null,
      conflictDevice: null,
    });
    expect(rows[1]).toMatchObject({
      body: bodyOf('typed on the laptop'),
      conflictOf: section.id,
      // The stored body's device, from when the laptop pushed it.
      conflictDevice: 'Firefox on macOS',
      parentId: null,
      createdAt: new Date(LATER),
      rev: 5n,
      deletedAt: null,
    });
    // The section's citations follow its new body.
    const cited = await t.prisma.citation.findMany({ where: { sourceId: section.id } });
    expect(cited.map((c) => c.book)).toEqual(['JHN']);
  });

  it('the newer body stays and the older becomes a copy (laptop later)', async () => {
    const { lesson, section, result } = await bothTyped(EARLIER);
    expect(result).toMatchObject({ status: 'conflict', resolution: 'conflicted-copy' });
    const copyId = (result as { copyId?: string }).copyId!;
    await expect(storedSection(section.id)).resolves.toMatchObject({
      body: bodyOf('typed on the laptop'),
    });
    const copy = await storedSection(copyId);
    expect(copy).toMatchObject({
      body: PHONE_BODY,
      conflictOf: section.id,
      conflictDevice: 'Chrome on Android',
    });
    // The copy is in the verse index like any section.
    const cited = await t.prisma.citation.findMany({ where: { sourceId: copyId } });
    expect(cited).toEqual([expect.objectContaining({ book: 'JHN', lessonId: lesson.id })]);
  });

  it('a replay returns the same copy and makes no other', async () => {
    const { lesson, section } = await lessonWithSection();
    await pushOne(upsert('section', { ...section, body: bodyOf('laptop'), updatedAt: LATER }, 2));
    const phone = upsert('section', { ...section, body: bodyOf('phone'), updatedAt: LATEST }, 2);
    const first = await pushOne(phone);
    expect(await pushOne(phone)).toEqual(first);
    await expect(t.prisma.section.count({ where: { lessonId: lesson.id } })).resolves.toBe(2);
  });

  it('a move on one device and typing on the other make no copy', async () => {
    const { lesson, section } = await lessonWithSection();
    await pushOne(
      upsert('section', { ...section, body: bodyOf('typed on the laptop'), updatedAt: LATER }, 2, [
        'body',
        'updatedAt',
      ]),
    );
    const moved = { ...section, orderKey: 'a5', updatedAt: LATEST };
    const result = await pushOne(upsert('section', moved, 2, ['orderKey', 'updatedAt']));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'client-won' });
    await expect(storedSection(section.id)).resolves.toMatchObject({
      orderKey: 'a5',
      body: bodyOf('typed on the laptop'),
    });
    await expect(t.prisma.section.count({ where: { lessonId: lesson.id } })).resolves.toBe(1);
  });

  it('typing on a section the other device only moved later keeps the typing', async () => {
    const { section } = await lessonWithSection();
    await pushOne(
      upsert('section', { ...section, orderKey: 'a5', updatedAt: LATEST }, 2, [
        'orderKey',
        'updatedAt',
      ]),
    );
    const typed = { ...section, body: bodyOf('typed on the phone'), updatedAt: LATER };
    const result = await pushOne(upsert('section', typed, 2, ['body', 'updatedAt']));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'server-won' });
    await expect(storedSection(section.id)).resolves.toMatchObject({
      orderKey: 'a5',
      body: bodyOf('typed on the phone'),
    });
  });

  it('edits of one row in one batch build on each other, with no copy', async () => {
    const { lesson, section } = await lessonWithSection();
    const results = await sync.pushOk(client, account, [
      upsert('section', { ...section, body: bodyOf('Nothing'), updatedAt: LATER }, 2, ['body']),
      upsert('section', { ...section, body: bodyOf('Nothing separates'), updatedAt: LATEST }, 2, [
        'body',
      ]),
    ]);
    expect(results).toMatchObject([
      { status: 'applied', rev: 3 },
      { status: 'applied', rev: 4 },
    ]);
    await expect(storedSection(section.id)).resolves.toMatchObject({
      body: bodyOf('Nothing separates'),
    });
    await expect(t.prisma.section.count({ where: { lessonId: lesson.id } })).resolves.toBe(1);
  });
});

describe('one side deleted, the other edited: the edit wins', () => {
  it('a row deleted on the laptop and edited on the phone comes back with the edit', async () => {
    const { section } = await lessonWithSection();
    await pushOne(remove('section', section.id, 2)); // rev 3
    const edited = { ...section, body: bodyOf('typed on the phone'), updatedAt: LATEST };
    const result = await pushOne(upsert('section', edited, 2, ['body', 'updatedAt']));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'edit-won', rev: 4 });
    await expect(storedSection(section.id)).resolves.toMatchObject({
      deletedAt: null,
      body: bodyOf('typed on the phone'),
      rev: 4n,
    });
  });

  it('a delete of a row the other device edited since keeps the edit', async () => {
    const { section } = await lessonWithSection();
    const edited = { ...section, body: bodyOf('typed on the laptop'), updatedAt: LATER };
    await pushOne(upsert('section', edited, 2)); // rev 3
    const result = await pushOne(remove('section', section.id, 2, LATEST));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'edit-won', rev: 4 });
    await expect(storedSection(section.id)).resolves.toMatchObject({
      deletedAt: null,
      body: bodyOf('typed on the laptop'),
      rev: 4n,
    });
    await expect(t.prisma.citation.count({ where: { sourceId: section.id } })).resolves.toBe(0);
  });
});

describe('both deleted', () => {
  it('is a no-op that keeps the first deletion', async () => {
    const { section } = await lessonWithSection();
    await pushOne(remove('section', section.id, 2, LATER)); // rev 3
    const result = await pushOne(remove('section', section.id, 2, LATEST));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'already-deleted', rev: 4 });
    await expect(storedSection(section.id)).resolves.toMatchObject({
      deletedAt: new Date(LATER),
      updatedAt: new Date(LATER),
    });
  });
});

describe('a row under a deleted parent', () => {
  it('a section added under a deleted lesson restores the lesson', async () => {
    const lesson = lessonRow();
    await pushOne(upsert('lesson', lesson)); // rev 1
    await pushOne(remove('lesson', lesson.id, 1)); // rev 2
    await expect(t.prisma.citation.count({ where: { sourceId: lesson.id } })).resolves.toBe(0);

    const result = await pushOne(upsert('section', sectionRow(lesson.id)));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'parent-restored', rev: 3 });
    const stored = await t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(stored).toMatchObject({ deletedAt: null, rev: 3n });
    // The restored lesson's main passages are back in the verse index.
    await expect(t.prisma.citation.count({ where: { sourceId: lesson.id } })).resolves.toBe(1);
  });

  it('a reply under a deleted section in a deleted lesson restores both', async () => {
    const { lesson, section } = await lessonWithSection();
    await sync.pushOk(client, account, [
      remove('section', section.id, 2),
      remove('lesson', lesson.id, 1),
    ]);
    const reply = sectionRow(lesson.id, { parentId: section.id });
    const result = await pushOne(upsert('section', reply));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'parent-restored' });
    await expect(storedSection(section.id)).resolves.toMatchObject({ deletedAt: null });
    await expect(
      t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }),
    ).resolves.toMatchObject({ deletedAt: null });
  });

  it('a tag link restores a deleted tag', async () => {
    const lesson = lessonRow();
    const tag = { ...sync.tagRow('grace') };
    await sync.pushOk(client, account, [upsert('lesson', lesson), upsert('tag', tag)]);
    await pushOne(remove('tag', tag.id, 2));
    const link: Row = { ...sync.synced(), tagId: tag.id, lessonId: lesson.id };
    const result = await pushOne(upsert('lessonTag', link));
    expect(result).toMatchObject({ status: 'conflict', resolution: 'parent-restored' });
    await expect(t.prisma.tag.findUniqueOrThrow({ where: { id: tag.id } })).resolves.toMatchObject({
      deletedAt: null,
    });
  });

  it('a losing edit restores nothing', async () => {
    const lesson = lessonRow();
    const takeaway = { ...sync.synced(), lessonId: lesson.id, text: 'Hold fast' };
    await sync.pushOk(client, account, [upsert('lesson', lesson), upsert('takeaway', takeaway)]);
    await pushOne(upsert('takeaway', { ...takeaway, text: 'Laptop', updatedAt: LATEST }, 2)); // rev 3
    await pushOne(remove('lesson', lesson.id, 1)); // rev 4
    const result = await pushOne(
      upsert('takeaway', { ...takeaway, text: 'Phone', updatedAt: LATER }, 2, ['text']),
    );
    expect(result).toMatchObject({ status: 'conflict', resolution: 'server-won' });
    await expect(
      t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } }),
    ).resolves.toMatchObject({ deletedAt: expect.any(Date) });
  });
});
