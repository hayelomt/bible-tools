import {
  type GroupPulledRow,
  groupPullResponseSchema,
  pullResponseSchema,
  type PulledRow,
} from '@lamp/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type TestApp, createTestApp } from './int/app.js';
import { truncateAll } from './int/db.js';
import { ownLesson, shared, twoInAGroup } from './int/groups.js';
import { type Client, createClient } from './int/http.js';
import {
  type Account,
  bodyOf,
  CLIENT_VERSION,
  commentRow,
  LATER,
  NOW,
  PULL_DEVICE,
  pushOk,
  questionRow,
  remove,
  sectionRow,
  signUp,
  upsert,
} from './int/sync.js';

/**
 * Group threads (F35, M13-08 to M13-10, §17.12): group sections and questions, comments, and
 * answers, read by members through the group's feed. Private rows never leave their owner.
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

const LATEST = '2026-10-13T12:00:00.000Z';

const group = () => twoInAGroup(t, client);

const groupPull = (account: Account, groupId: string, cursor = 0) =>
  client.get(
    `/api/groups/${groupId}/pull?cursor=${cursor}&clientVersion=${CLIENT_VERSION}`,
    account.token,
  );

const feed = async (account: Account, groupId: string, cursor = 0) =>
  groupPullResponseSchema.parse((await groupPull(account, groupId, cursor).expect(200)).body);

/** The rows of the account's own pull, as plain records. */
const userRows = async (account: Account): Promise<{ row: Record<string, unknown> }[]> =>
  pullResponseSchema.parse(
    (
      await client
        .get(
          `/api/sync/pull?cursor=0&${PULL_DEVICE}&clientVersion=${CLIENT_VERSION}`,
          account.token,
        )
        .expect(200)
    ).body,
  ).rows as PulledRow[] as unknown as { row: Record<string, unknown> }[];

/** The live rows of an entity in a page, by id. */
function live<E extends GroupPulledRow['entity']>(rows: GroupPulledRow[], entity: E) {
  return new Map(
    rows
      .filter(
        (r): r is Extract<GroupPulledRow, { entity: E; row: unknown }> =>
          r.entity === entity && !('gone' in r),
      )
      .map((r) => [r.row.id, r.row]),
  );
}

const gone = (rows: GroupPulledRow[]) =>
  rows
    .filter((r) => 'gone' in r)
    .map((r) => `${r.entity}:${(r as { id: string }).id}`)
    .toSorted();

const revOf = async (entity: 'section' | 'comment' | 'lesson' | 'question', id: string) => {
  const model = t.prisma[entity] as unknown as {
    findUniqueOrThrow(args: object): Promise<{ rev: bigint }>;
  };
  return Number((await model.findUniqueOrThrow({ where: { id } })).rev);
};

describe('the group thread (M13-08)', () => {
  it('reaches every member; private sections never leave their owner', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const annShared = shared(lesson.id, groupId, 'The door is the only way in.');
    const annPrivate = sectionRow(lesson.id, { body: bodyOf('Ask Ben about this.') });
    await pushOk(client, ann, [upsert('section', annShared), upsert('section', annPrivate)]);

    const own = await ownLesson(ben, lesson);
    const benShared = shared(own.id, groupId, 'Compare Psalm 23.', {
      replyToId: annShared.id,
      sharedAt: LATER,
    });
    const benReply = shared(own.id, groupId, 'And verse 4.', { parentId: benShared.id });
    const benPrivate = sectionRow(own.id, { body: bodyOf('Still unsure.') });
    const results = await pushOk(client, ben, [
      upsert('lesson', own),
      upsert('section', benShared),
      upsert('section', benReply),
      upsert('section', benPrivate),
    ]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'applied', 'applied']);

    for (const account of [ann, ben]) {
      const page = await feed(account, groupId);
      const sections = live(page.rows, 'section');
      expect([...sections.keys()].toSorted()).toEqual(
        [annShared.id, benShared.id, benReply.id].toSorted(),
      );
      // Every thread names the group lesson, Ben's own lesson never reaches the feed.
      for (const section of sections.values()) {
        expect((section as { groupLessonId: string }).groupLessonId).toBe(lesson.id);
      }
      expect(live(page.rows, 'lesson').has(own.id)).toBe(false);
      expect(sections.get(benShared.id)).toEqual({
        id: benShared.id,
        userId: ben.id,
        groupLessonId: lesson.id,
        parentId: null,
        replyToId: annShared.id,
        sharedAt: LATER,
        body: benShared.body,
        sourceAt: null,
        sourcePage: null,
        answersQuestionId: null,
        answerKind: null,
        createdAt: NOW,
        updatedAt: NOW,
      });
    }
    // The private rows stay in their owners' own pulls.
    const annRows = await userRows(ann);
    expect(annRows.some((r) => r.row.id === benPrivate.id || r.row.id === benShared.id)).toBe(
      false,
    );
    expect((await userRows(ben)).some((r) => r.row.id === annPrivate.id)).toBe(false);
  });

  it('keeps what a non-member shares as their own private note, and refuses a stray reference', async () => {
    const { ann, groupId, lesson } = await group();
    const annShared = shared(lesson.id, groupId, 'The door.');
    await pushOk(client, ann, [upsert('section', annShared)]);

    const outsider = await signUp(t, client);
    const own = await ownLesson(outsider, lesson);
    const theirs = shared(own.id, groupId, 'Let me in.');
    const [made, posted] = await pushOk(client, outsider, [
      upsert('lesson', own),
      upsert('section', theirs),
    ]);
    expect([made?.status, posted?.status]).toEqual(['applied', 'applied']);
    const stored = await t.prisma.section.findUniqueOrThrow({ where: { id: theirs.id } });
    expect([stored.visibility, stored.groupId, stored.sharedAt]).toEqual(['private', null, null]);
    // Not in the group: an ordinary lesson of theirs.
    const lessonStored = await t.prisma.lesson.findUniqueOrThrow({ where: { id: own.id } });
    expect(lessonStored.groupLessonId).toBeNull();
    expect(live((await feed(ann, groupId)).rows, 'section').has(theirs.id)).toBe(false);
    await groupPull(outsider, groupId).expect(404);

    // A member may reply only to what the group sees.
    const ben = await signUp(t, client);
    const benOwn = await ownLesson(ben, lesson);
    await pushOk(client, ben, [upsert('lesson', benOwn)]);
    const [stray] = await pushOk(client, ben, [
      upsert('section', sectionRow(benOwn.id, { replyToId: annShared.id })),
    ]);
    expect(stray).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });
  });

  it('moving a section to my notes takes it, its replies and its comments out', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const section = shared(lesson.id, groupId, 'The door.');
    const reply = shared(lesson.id, groupId, 'And the gate.', { parentId: section.id });
    await pushOk(client, ann, [upsert('section', section), upsert('section', reply)]);
    const comment = commentRow(section.id, groupId);
    await pushOk(client, ben, [upsert('comment', comment)]);
    const before = await feed(ben, groupId);
    expect(live(before.rows, 'comment').has(comment.id)).toBe(true);

    await pushOk(client, ann, [
      upsert(
        'section',
        { ...section, visibility: 'private', groupId: null, sharedAt: null, updatedAt: LATER },
        await revOf('section', section.id),
      ),
    ]);
    const after = await feed(ben, groupId, before.nextCursor);
    expect(gone(after.rows)).toEqual(
      [`comment:${comment.id}`, `section:${reply.id}`, `section:${section.id}`].toSorted(),
    );
  });

  it("a deleted group lesson takes members' threads on it; restored, they come back", async () => {
    const { ann, ben, groupId, lesson } = await group();
    const own = await ownLesson(ben, lesson);
    const benShared = shared(own.id, groupId, 'Compare Psalm 23.');
    const question = questionRow(own.id, { visibility: 'group', groupId });
    await pushOk(client, ben, [
      upsert('lesson', own),
      upsert('section', benShared),
      upsert('question', question),
    ]);
    const start = await feed(ann, groupId);
    expect(live(start.rows, 'question').get(question.id)).toMatchObject({
      userId: ben.id,
      groupLessonId: lesson.id,
      text: question.text,
    });

    await pushOk(client, ann, [remove('lesson', lesson.id, await revOf('lesson', lesson.id))]);
    const deleted = await feed(ann, groupId, start.nextCursor);
    expect(gone(deleted.rows)).toEqual(
      [`lesson:${lesson.id}`, `question:${question.id}`, `section:${benShared.id}`].toSorted(),
    );
    // Ben's rows are his still, unchanged.
    const stored = await t.prisma.section.findUniqueOrThrow({ where: { id: benShared.id } });
    expect([stored.visibility, stored.groupId]).toEqual(['group', groupId]);

    // A section written on it restores it (§6.4), and the group sees it all again.
    await pushOk(client, ann, [upsert('section', sectionRow(lesson.id, { updatedAt: LATEST }))]);
    const restored = await feed(ben, groupId, deleted.nextCursor);
    expect([...live(restored.rows, 'section').keys()]).toEqual([benShared.id]);
    expect(live(restored.rows, 'question').has(question.id)).toBe(true);
  });

  it('leaving makes what the member added theirs again, and takes it out of the feed', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const annShared = shared(lesson.id, groupId, 'The door.');
    await pushOk(client, ann, [upsert('section', annShared)]);
    const own = await ownLesson(ben, lesson);
    const benShared = shared(own.id, groupId, 'Psalm 23.');
    const question = questionRow(own.id, { visibility: 'group', groupId });
    const comment = commentRow(annShared.id, groupId);
    await pushOk(client, ben, [
      upsert('lesson', own),
      upsert('section', benShared),
      upsert('question', question),
      upsert('comment', comment),
    ]);
    // Ann renames her lesson after Ben made his own for it.
    await pushOk(client, ann, [
      upsert(
        'lesson',
        { ...lesson, title: 'I am the door', updatedAt: LATER },
        await revOf('lesson', lesson.id),
      ),
    ]);
    const start = await feed(ann, groupId);

    await client.post(`/api/groups/${groupId}/leave`, {}, ben.token).expect(204);
    const after = await feed(ann, groupId, start.nextCursor);
    const membership = 'member:';
    expect(gone(after.rows).filter((key) => !key.startsWith(membership))).toEqual(
      [`comment:${comment.id}`, `question:${question.id}`, `section:${benShared.id}`].toSorted(),
    );

    const rows = await userRows(ben);
    const find = (id: string) => rows.find((r) => r.row.id === id)?.row as Record<string, unknown>;
    expect(find(benShared.id)).toMatchObject({
      visibility: 'private',
      groupId: null,
      sharedAt: null,
    });
    expect(find(question.id)).toMatchObject({ visibility: 'private', groupId: null });
    expect(find(comment.id)?.deletedAt).not.toBeNull();
    // His own lesson reads as an ordinary lesson now, with the group lesson's details.
    expect(find(own.id)).toMatchObject({ title: 'I am the door', groupLessonId: lesson.id });
  });
});

describe('comments (M13-09)', () => {
  it('reach members only, and only on a section the group sees', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const section = shared(lesson.id, groupId, 'The door.');
    const note = sectionRow(lesson.id);
    await pushOk(client, ann, [upsert('section', section), upsert('section', note)]);

    const comment = commentRow(section.id, groupId, 'Like the sheepfold walls.');
    const [ok, onPrivate] = await pushOk(client, ben, [
      upsert('comment', comment),
      upsert('comment', commentRow(note.id, groupId)),
    ]);
    expect(ok?.status).toBe('applied');
    expect(onPrivate).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });
    const page = await feed(ann, groupId);
    expect(live(page.rows, 'comment').get(comment.id)).toEqual({
      id: comment.id,
      userId: ben.id,
      sectionId: section.id,
      body: comment.body,
      createdAt: NOW,
      updatedAt: NOW,
    });

    // Someone outside the group can't read it through any endpoint, and their own comment on the
    // section is kept but never shown.
    const outsider = await signUp(t, client);
    await groupPull(outsider, groupId).expect(404);
    expect((await userRows(outsider)).some((r) => r.row.id === comment.id)).toBe(false);
    const theirs = commentRow(section.id, groupId);
    expect((await pushOk(client, outsider, [upsert('comment', theirs)]))[0]?.status).toBe(
      'applied',
    );
    expect(live((await feed(ann, groupId)).rows, 'comment').has(theirs.id)).toBe(false);
  });

  it('edits and deletes go out; the section and group never change', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const section = shared(lesson.id, groupId, 'The door.');
    const other = shared(lesson.id, groupId, 'The gate.');
    await pushOk(client, ann, [upsert('section', section), upsert('section', other)]);
    const comment = commentRow(section.id, groupId);
    await pushOk(client, ben, [upsert('comment', comment)]);
    const start = await feed(ann, groupId);

    const edited = { ...comment, sectionId: other.id, body: bodyOf('Edited'), updatedAt: LATER };
    await pushOk(client, ben, [upsert('comment', edited, await revOf('comment', comment.id))]);
    const changed = await feed(ann, groupId, start.nextCursor);
    expect(live(changed.rows, 'comment').get(comment.id)).toMatchObject({
      sectionId: section.id,
      body: bodyOf('Edited'),
    });

    await pushOk(client, ben, [remove('comment', comment.id, await revOf('comment', comment.id))]);
    const deleted = await feed(ann, groupId, changed.nextCursor);
    expect(gone(deleted.rows)).toEqual([`comment:${comment.id}`]);
  });
});

describe('group questions and their answers (M13-10)', () => {
  it('an answer names a group question the feed has', async () => {
    const { ann, ben, groupId, lesson } = await group();
    const own = await ownLesson(ben, lesson);
    const question = questionRow(own.id, { visibility: 'group', groupId });
    const privateOne = questionRow(own.id);
    await pushOk(client, ben, [
      upsert('lesson', own),
      upsert('question', question),
      upsert('question', privateOne),
    ]);

    const answer = shared(lesson.id, groupId, 'The Gentiles.', {
      answersQuestionId: question.id,
      answerKind: 'partial',
    });
    const [applied, stray] = await pushOk(client, ann, [
      upsert('section', answer),
      upsert(
        'section',
        shared(lesson.id, groupId, 'Private?', {
          answersQuestionId: privateOne.id,
          answerKind: 'full',
        }),
      ),
    ]);
    expect(applied?.status).toBe('applied');
    expect(stray).toMatchObject({ status: 'rejected', errorCode: 'REFERENCE_NOT_FOUND' });

    const page = await feed(ben, groupId);
    expect([...live(page.rows, 'question').keys()]).toEqual([question.id]);
    expect(live(page.rows, 'section').get(answer.id)).toMatchObject({
      answersQuestionId: question.id,
      answerKind: 'partial',
      userId: ann.id,
    });
  });
});

describe('the group pull', () => {
  it('ends at the group rev, past a rev that changed nothing it shows', async () => {
    const { ann, ben, groupId } = await group();
    const first = await feed(ben, groupId);
    await client.post(`/api/groups/${groupId}/invite`, {}, ann.token).expect(200);
    const { syncRev } = await t.prisma.group.findUniqueOrThrow({ where: { id: groupId } });
    const next = await feed(ben, groupId, first.nextCursor);
    expect(next).toMatchObject({ rows: [], nextCursor: Number(syncRev), hasMore: false });
  });
});
