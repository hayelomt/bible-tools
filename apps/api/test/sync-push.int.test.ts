import { apiErrorSchema, type EntityName, newId, type PushResult } from '@lamp/domain';
import type request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { type Client, createClient } from './int/http.js';
import * as sync from './int/sync.js';
import {
  type Account,
  bodyCiting,
  bodyLinking,
  DEVICE_ID,
  JOHN_3_16,
  LATER,
  lessonRow,
  NOW,
  ROMANS_8_28,
  type Row,
  remove,
  sectionRow,
  synced,
  tagRow,
  upsert,
} from './int/sync.js';

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

const errorCode = (res: request.Response): string => apiErrorSchema.parse(res.body).errorCode;

const signUp = (options?: { verified?: boolean }) => sync.signUp(t, client, options);
const push = (account: Account | undefined, changes: object[]) =>
  sync.push(client, account, changes);
const pushOk = (account: Account, changes: object[]): Promise<PushResult[]> =>
  sync.pushOk(client, account, changes);

const syncRev = async (account: Account) =>
  (await t.prisma.user.findUniqueOrThrow({ where: { id: account.id } })).syncRev;

/** Every synced row and citation the account has, for comparing before and after. */
async function snapshot(account: Account) {
  const where = { userId: account.id };
  const p = t.prisma;
  return {
    syncRev: await syncRev(account),
    lessons: await p.lesson.findMany({ where, orderBy: { id: 'asc' } }),
    sections: await p.section.findMany({ where, orderBy: { id: 'asc' } }),
    tags: await p.tag.findMany({ where, orderBy: { id: 'asc' } }),
    sectionTags: await p.sectionTag.findMany({ where, orderBy: { id: 'asc' } }),
    settings: await p.userSettings.findMany({ where }),
    citations: await p.citation.findMany({
      where,
      orderBy: [{ sourceId: 'asc' }, { startOrd: 'asc' }],
      omit: { id: true },
    }),
    changes: await p.syncChange.findMany({ where, orderBy: { id: 'asc' } }),
  };
}

/** Another account with a lesson and a section, and a snapshot of everything it has. */
async function theirLesson() {
  const theirs = await signUp();
  const lesson = lessonRow();
  const section = sectionRow(lesson.id);
  await pushOk(theirs, [upsert('lesson', lesson), upsert('section', section)]);
  return { theirs, lesson, section, before: await snapshot(theirs) };
}

describe('POST /api/sync/push', () => {
  it('needs a session', async () => {
    const res = await push(undefined, [upsert('lesson', lessonRow())]).expect(401);
    expect(errorCode(res)).toBe('UNAUTHORIZED');
  });

  it('needs a verified email, and changes nothing until then', async () => {
    const account = await signUp({ verified: false });
    const res = await push(account, [upsert('lesson', lessonRow())]).expect(403);
    expect(errorCode(res)).toBe('EMAIL_NOT_VERIFIED');
    await expect(t.prisma.lesson.count()).resolves.toBe(0);
    await expect(t.prisma.syncChange.count()).resolves.toBe(0);
  });

  it('refuses a request without changes, or with more than 100', async () => {
    const account = await signUp();
    expect(errorCode(await push(account, []).expect(400))).toBe('VALIDATION_FAILED');
    const tooMany = Array.from({ length: 101 }, () => upsert('tag', tagRow(newId())));
    expect(errorCode(await push(account, tooMany).expect(400))).toBe('VALIDATION_FAILED');
  });

  it('takes a body of nearly 1 MB, and refuses a larger one', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const big = (size: number) =>
      sectionRow(lesson.id, {
        body: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x'.repeat(size) }] }],
        },
      });
    const results = await pushOk(account, [
      upsert('lesson', lesson),
      upsert('section', big(900_000)),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied']);
    const res = await push(account, [upsert('section', big(1_100_000))]).expect(413);
    expect(errorCode(res)).toBe('PAYLOAD_TOO_LARGE');
  });

  it('applies new rows in order, each with the next revision', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const section = sectionRow(lesson.id);
    const tag = tagRow('grace');
    const link = { ...synced(), tagId: tag.id, sectionId: section.id };
    const changes = [
      upsert('lesson', lesson),
      upsert('section', section),
      upsert('tag', tag),
      upsert('sectionTag', link),
    ];

    const results = await pushOk(account, changes);
    expect(results).toEqual(
      changes.map((c, i) => ({ changeId: c.changeId, status: 'applied', rev: i + 1 })),
    );
    expect(await syncRev(account)).toBe(4n);

    const stored = await t.prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(stored).toMatchObject({
      userId: account.id,
      lessonId: lesson.id,
      rev: 2n,
      body: section.body,
      createdAt: new Date(NOW),
      deletedAt: null,
    });
    const storedLesson = await t.prisma.lesson.findUniqueOrThrow({ where: { id: lesson.id } });
    expect(storedLesson.date).toEqual(new Date('2026-10-04T00:00:00Z'));
    await expect(t.prisma.sectionTag.count({ where: { userId: account.id } })).resolves.toBe(1);
    await expect(
      t.prisma.syncChange.count({
        where: { userId: account.id, deviceId: DEVICE_ID, status: 'applied' },
      }),
    ).resolves.toBe(4);
  });

  it('builds the citations of lessons and sections', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const section = sectionRow(lesson.id, { body: bodyCiting(ROMANS_8_28, JOHN_3_16) });
    await pushOk(account, [upsert('lesson', lesson), upsert('section', section)]);

    const citations = await t.prisma.citation.findMany({
      where: { userId: account.id },
      orderBy: { startOrd: 'asc' },
    });
    expect(citations.map((c) => [c.sourceType, c.sourceId, c.lessonId, c.book])).toEqual([
      ['section', section.id, lesson.id, 'JHN'],
      ['lesson', lesson.id, lesson.id, 'ROM'],
      ['section', section.id, lesson.id, 'ROM'],
    ]);
  });

  it('builds a section’s links from its body, and drops them with it (§17.4)', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const target = sectionRow(lesson.id);
    // A link to a row this account doesn't have is allowed: it shows as broken.
    const missing = newId();
    const section = sectionRow(lesson.id, { orderKey: 'a1', body: bodyLinking('lesson', missing) });
    await pushOk(account, [
      upsert('lesson', lesson),
      upsert('section', target),
      upsert('section', section),
    ]);
    const links = () =>
      t.prisma.link.findMany({ where: { userId: account.id }, omit: { id: true, userId: true } });
    await expect(links()).resolves.toEqual([
      {
        fromSectionId: section.id,
        fromLessonId: lesson.id,
        targetType: 'lesson',
        targetId: missing,
      },
    ]);

    const relinked = { ...section, updatedAt: LATER, body: bodyLinking('section', target.id) };
    await pushOk(account, [upsert('section', relinked, 3)]);
    await expect(links()).resolves.toEqual([
      {
        fromSectionId: section.id,
        fromLessonId: lesson.id,
        targetType: 'section',
        targetId: target.id,
      },
    ]);

    await pushOk(account, [remove('section', section.id, 4)]);
    await expect(links()).resolves.toEqual([]);
  });

  it('stores a question entry, which pulls without the question’s old status', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const question = {
      ...synced(),
      lessonId: lesson.id,
      text: 'Who are the other sheep?',
      splitFromId: null,
      visibility: 'private',
      groupId: null,
    };
    const entry = {
      ...synced(),
      questionId: question.id,
      lessonId: lesson.id,
      kind: 'asked',
      sectionId: null,
    };
    const results = await pushOk(account, [
      upsert('lesson', lesson),
      upsert('question', question),
      upsert('questionEntry', entry),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
    // The retired columns keep their defaults, and are never sent.
    await expect(
      t.prisma.question.findUniqueOrThrow({ where: { id: question.id } }),
    ).resolves.toMatchObject({ status: 'open', answerSectionId: null });
    const pulled = await client
      .get(
        `/api/sync/pull?cursor=0&clientVersion=${sync.CLIENT_VERSION}&${sync.PULL_DEVICE}`,
        account.token,
      )
      .expect(200);
    const rows = (pulled.body as { rows: { entity: string; row: object }[] }).rows;
    expect(rows.find((r) => r.entity === 'question')?.row).toEqual({ ...question, rev: 2 });
    expect(rows.find((r) => r.entity === 'questionEntry')?.row).toEqual({ ...entry, rev: 3 });
  });

  it('refuses a question with its old status', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const question = {
      ...synced(),
      lessonId: lesson.id,
      text: 'Why?',
      splitFromId: null,
      visibility: 'private',
      groupId: null,
      status: 'open',
    };
    const [, result] = await pushOk(account, [
      upsert('lesson', lesson),
      upsert('question', question),
    ]);
    expect(result).toMatchObject({ status: 'rejected', errorCode: 'INVALID_CHANGE' });
  });

  it('updates a row whose baseRev is current, and rebuilds its citations', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const section = sectionRow(lesson.id);
    await pushOk(account, [upsert('lesson', lesson), upsert('section', section)]);
    const edited = { ...section, updatedAt: LATER, body: bodyCiting(JOHN_3_16) };

    const [result] = await pushOk(account, [upsert('section', edited, 2)]);
    expect(result).toMatchObject({ status: 'applied', rev: 3 });
    const stored = await t.prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(stored).toMatchObject({ rev: 3n, body: edited.body, updatedAt: new Date(LATER) });
    const books = await t.prisma.citation.findMany({ where: { sourceId: section.id } });
    expect(books.map((c) => c.book)).toEqual(['JHN']);
  });

  it('leaves a tombstone for a delete and drops its citations', async () => {
    const account = await signUp();
    const lesson = lessonRow();
    const section = sectionRow(lesson.id);
    await pushOk(account, [upsert('lesson', lesson), upsert('section', section)]);

    const [result] = await pushOk(account, [remove('section', section.id, 2)]);
    expect(result).toMatchObject({ status: 'applied', rev: 3 });
    const stored = await t.prisma.section.findUniqueOrThrow({ where: { id: section.id } });
    expect(stored).toMatchObject({
      rev: 3n,
      deletedAt: new Date(LATER),
      updatedAt: new Date(LATER),
    });
    await expect(t.prisma.citation.count({ where: { sourceId: section.id } })).resolves.toBe(0);
    await expect(t.prisma.citation.count({ where: { sourceId: lesson.id } })).resolves.toBe(1);
  });

  it('stores the account settings as one row', async () => {
    const account = await signUp();
    const settings = {
      colorMode: 'dark',
      defaultTranslation: 'BSB',
      reviewWindowDays: 7,
      autoPreviewVerses: true,
      pasteChips: true,
      openInTargets: ['blueletterbible', 'youversion', 'biblehub', 'logos'],
      defaultTemplates: { sermon: null, personal: null, group: null },
      resurfacing: { yearAgo: true, repeatedVerse: true, staleQuestion: true },
      lastDigestQuarter: null,
      updatedAt: NOW,
    };
    const first = {
      changeId: newId(),
      baseRev: 0,
      clientTime: NOW,
      entity: 'userSettings',
      op: 'upsert',
      row: settings,
    };
    expect(await pushOk(account, [first])).toEqual([
      { changeId: first.changeId, status: 'applied', rev: 1 },
    ]);
    const second = {
      ...first,
      changeId: newId(),
      baseRev: 1,
      row: { ...settings, reviewWindowDays: 30, updatedAt: LATER },
    };
    expect(await pushOk(account, [second])).toEqual([
      { changeId: second.changeId, status: 'applied', rev: 2 },
    ]);

    const stored = await t.prisma.userSettings.findMany({ where: { userId: account.id } });
    expect(stored).toEqual([
      expect.objectContaining({
        colorMode: 'dark',
        reviewWindowDays: 30,
        rev: 2n,
      }),
    ]);
  });

  describe('a replayed batch', () => {
    it('gets the same results and changes nothing', async () => {
      const account = await signUp();
      const lesson = lessonRow();
      const section = sectionRow(lesson.id);
      const batch = [
        upsert('lesson', lesson),
        upsert('section', section),
        upsert('section', sectionRow(newId())), // rejected: no such lesson
        remove('section', section.id, 2),
      ];
      const first = await pushOk(account, batch);
      expect(first.map((r) => r.status)).toEqual(['applied', 'applied', 'rejected', 'applied']);
      const before = await snapshot(account);

      expect(await pushOk(account, batch)).toEqual(first);
      expect(await snapshot(account)).toEqual(before);
    });

    it('gets the same results when sent twice at once', async () => {
      const account = await signUp();
      const lesson = lessonRow();
      const batch = [
        upsert('lesson', lesson),
        upsert('section', sectionRow(lesson.id)),
        upsert('tag', tagRow('hope')),
      ];
      const [a, b] = await Promise.all([pushOk(account, batch), pushOk(account, batch)]);
      expect(a).toEqual(b);
      expect(a.map((r) => r.status)).toEqual(['applied', 'applied', 'applied']);
      expect(await syncRev(account)).toBe(3n);
      await expect(t.prisma.syncChange.count()).resolves.toBe(3);
    });

    it('a change id already used by another account is refused, and theirs is kept', async () => {
      const mine = await signUp();
      const theirs = await signUp();
      const change = upsert('tag', tagRow('grace'));
      await pushOk(theirs, [change]);
      const row = tagRow('hope');
      const [result] = await pushOk(mine, [{ ...change, entityId: row.id, row }]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'CHANGE_ID_TAKEN' });
      await expect(t.prisma.tag.count({ where: { userId: mine.id } })).resolves.toBe(0);
      await expect(t.prisma.syncChange.count()).resolves.toBe(1);
    });
  });

  describe("another account's rows", () => {
    it('an upsert of their row is rejected and changes nothing of theirs', async () => {
      const { theirs, lesson, before } = await theirLesson();
      const mine = await signUp();
      const [result] = await pushOk(mine, [upsert('lesson', { ...lesson, title: 'Mine now' }, 1)]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'ID_TAKEN' });
      expect(await snapshot(theirs)).toEqual(before);
    });

    it('a delete of their row is rejected', async () => {
      const { theirs, section, before } = await theirLesson();
      const mine = await signUp();
      const [result] = await pushOk(mine, [remove('section', section.id, 2)]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'ID_TAKEN' });
      expect(await snapshot(theirs)).toEqual(before);
    });

    it.each([
      ['a section in their lesson', (l: Row) => ['section', sectionRow(l.id)]],
      [
        'a reply under their section',
        (l: Row, s: Row) => ['section', sectionRow(newId(), { parentId: s.id })],
      ],
      [
        'a takeaway on their lesson',
        (l: Row) => ['takeaway', { ...synced(), lessonId: l.id, text: 'Hold fast' }],
      ],
      [
        'a question entry answered by their section',
        (l: Row, s: Row) => [
          'questionEntry',
          { ...synced(), questionId: newId(), lessonId: l.id, kind: 'answered', sectionId: s.id },
        ],
      ],
    ] as const)('referencing them is rejected: %s', async (_, make) => {
      const { theirs, lesson, section, before } = await theirLesson();
      const mine = await signUp();
      const [entity, row] = make(lesson, section) as [EntityName, Row];
      const [result] = await pushOk(mine, [upsert(entity, row)]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });
      expect(await snapshot(theirs)).toEqual(before);
      expect(await syncRev(mine)).toBe(0n);
    });

    it('a tag link to their tag is rejected', async () => {
      const theirs = await signUp();
      const tag = tagRow('grace');
      await pushOk(theirs, [upsert('tag', tag)]);
      const mine = await signUp();
      const lesson = lessonRow();
      const results = await pushOk(mine, [
        upsert('lesson', lesson),
        upsert('lessonTag', { ...synced(), tagId: tag.id, lessonId: lesson.id }),
      ]);
      expect(results[1]).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });
      await expect(t.prisma.lessonTag.count()).resolves.toBe(0);
    });
  });

  describe('one bad change', () => {
    it("doesn't block the rest of the batch", async () => {
      const account = await signUp();
      const lesson = lessonRow();
      const badSection = sectionRow(lesson.id, {
        body: { type: 'doc', content: [{ type: 'script' }] },
      });
      const results = await pushOk(account, [
        upsert('lesson', lesson),
        upsert('section', badSection),
        { changeId: newId(), entity: 'lesson', op: 'rename' },
        upsert('tag', tagRow('grace')),
        upsert('tag', tagRow('GRACE')), // the same name: a unique index the database checks
        upsert('section', sectionRow(lesson.id)),
      ]);
      expect(results.map((r) => (r.status === 'rejected' ? r.errorCode : r.status))).toEqual([
        'applied',
        'INVALID_CHANGE',
        'INVALID_CHANGE',
        'applied',
        'DUPLICATE',
        'applied',
      ]);
      expect(results.at(-1)).toMatchObject({ rev: 3 });
      await expect(t.prisma.section.count()).resolves.toBe(1);
      await expect(t.prisma.tag.count()).resolves.toBe(1);
    });

    it('is rejected with the fields that failed, not their values', async () => {
      const account = await signUp();
      const secret = 'my private prayer '.repeat(200);
      const [result] = await pushOk(account, [
        upsert('takeaway', { ...synced(), lessonId: newId(), text: secret }),
      ]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: 'INVALID_CHANGE' });
      expect(result!.status === 'rejected' && result!.message).toContain('row.text');
      expect(JSON.stringify(result)).not.toContain('private prayer');
    });

    it.each([
      ['a reply whose parent is in another lesson', 'REFERENCE_NOT_FOUND'],
      ['a section that is its own parent', 'REFERENCE_NOT_FOUND'],
      ['a delete of a row the server has never seen', 'NOT_FOUND'],
    ])('%s is rejected', async (name, code) => {
      const account = await signUp();
      const [one, two] = [lessonRow(), lessonRow()];
      const parent = sectionRow(one.id);
      await pushOk(account, [
        upsert('lesson', one),
        upsert('lesson', two),
        upsert('section', parent),
      ]);
      const self = sectionRow(one.id);
      const change = {
        'a reply whose parent is in another lesson': upsert(
          'section',
          sectionRow(two.id, { parentId: parent.id }),
        ),
        'a section that is its own parent': upsert('section', { ...self, parentId: self.id }),
        'a delete of a row the server has never seen': remove('section', newId(), 0),
      }[name]!;
      const [result] = await pushOk(account, [change]);
      expect(result).toMatchObject({ status: 'rejected', errorCode: code });
      expect(await syncRev(account)).toBe(3n);
    });
  });
});
