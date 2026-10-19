import {
  commentBody,
  type GroupPullResponse,
  type GroupPulledRow,
  headedBody,
  ownLessonId,
  type SectionBody,
} from '@lamp/domain';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncGroups } from '@/sync/groups.ts';
import {
  addComment,
  addToThread,
  answerInGroup,
  askInGroup,
  moveToMyNotes,
  shareWithGroup,
} from './actions/group-thread.ts';
import { markGroupSeen } from './actions/group-activity.ts';
import { createLesson } from './actions/lessons.ts';
import { createSection } from './actions/sections.ts';
import { LampDb } from './db.ts';
import { freshByGroup, groupActivityOf } from './group-activity.ts';
import {
  groupQuestionQueue,
  memberThread,
  type ThreadEntry,
  threadItems,
  threadOf,
  threadView,
} from './group-thread.ts';
import { allLessons } from './queries.ts';
import { ensureDevice } from './setup.ts';

const GROUP = '0199e0a0-0000-7000-8000-00000000a001';
const SERIES = '0199e0a0-0000-7000-8000-00000000b001';
const LESSON = '0199e0a0-0000-7000-8000-00000000c001';
const ANN = '0199e0a0-0000-7000-8000-00000000d001';
const BEN = '0199e0a0-0000-7000-8000-00000000d002';
const NOW = '2026-10-19T09:00:00.000Z';
const LATER = '2026-10-19T10:00:00.000Z';
const id = (n: number) => `0199e0a0-0000-7000-8000-${String(n).padStart(12, '0')}`;

const text = (t: string): SectionBody => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }],
});

/** Ann's group, as Ben's device pulls it: Ann's lesson, a section and question of hers. */
const annRows: GroupPulledRow[] = [
  { entity: 'group', addedRev: 1, row: { id: GROUP, name: 'Thursday group', createdAt: NOW } },
  {
    entity: 'member',
    addedRev: 1,
    row: { id: id(901), userId: ANN, displayName: 'Ann', role: 'owner', joinedAt: NOW },
  },
  {
    entity: 'member',
    addedRev: 1,
    row: { id: id(902), userId: BEN, displayName: 'Ben', role: 'member', joinedAt: NOW },
  },
  {
    entity: 'series',
    addedRev: 1,
    row: { id: SERIES, userId: ANN, title: 'John', description: '', kind: 'book_study' },
  },
  {
    entity: 'lesson',
    addedRev: 1,
    row: {
      id: LESSON,
      userId: ANN,
      seriesId: SERIES,
      title: 'The Good Shepherd',
      date: '2026-10-12',
      kind: 'sermon',
      speaker: 'Pastor Ann',
      church: null,
      mainPassages: [],
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      createdAt: NOW,
      updatedAt: NOW,
    },
  },
];

const annSection = (n: number, body: string, fields: object = {}): GroupPulledRow => ({
  entity: 'section',
  addedRev: 1,
  row: {
    id: id(n),
    userId: ANN,
    groupLessonId: LESSON,
    parentId: null,
    replyToId: null,
    sharedAt: NOW,
    body: text(body),
    sourceAt: null,
    sourcePage: null,
    answersQuestionId: null,
    answerKind: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...fields,
  },
});

const page = (rows: GroupPulledRow[], nextCursor: number): GroupPullResponse => ({
  rows,
  nextCursor,
  hasMore: false,
  remaining: rows.length,
});

let db: LampDb;
let count = 0;

beforeEach(async () => {
  db = new LampDb(`group-thread-${++count}`, { indexedDB, IDBKeyRange });
  await ensureDevice(db, { colorMode: 'system' });
});

afterEach(async () => {
  db.close();
  await db.delete();
});

/** Ben's device after pulling Ann's group, and where his notes on her lesson go. */
async function asBen(rows: GroupPulledRow[] = []) {
  await syncGroups(db, [{ id: GROUP, rev: 1 }], async () => page([...annRows, ...rows], 1));
  const groupLesson = (await db.groupLesson.get(LESSON))!;
  const place = (await memberThread(groupLesson, await ownLessonId(BEN, LESSON), db))!;
  const target = { groupId: GROUP, lessonId: place.ownLessonId, own: place.own };
  return { place, target };
}

describe('the group stores', () => {
  it('hold sections, questions and comments of the feed, and drop them with the group', async () => {
    await asBen([
      annSection(1, 'The door'),
      {
        entity: 'question',
        addedRev: 1,
        row: {
          id: id(2),
          userId: ANN,
          groupLessonId: LESSON,
          text: 'Who are the other sheep?',
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      {
        entity: 'comment',
        addedRev: 1,
        row: {
          id: id(3),
          userId: ANN,
          sectionId: id(1),
          body: commentBody('Psalm 23'),
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
    ]);
    expect(await db.groupSection.get(id(1))).toMatchObject({ groupId: GROUP, userId: ANN });
    expect(await db.groupQuestion.count()).toBe(1);
    expect(await db.groupComment.where({ sectionId: id(1) }).count()).toBe(1);

    await syncGroups(db, [], async () => page([], 1));
    for (const table of [db.groupSection, db.groupQuestion, db.groupComment]) {
      expect(await table.count()).toBe(0);
    }
  });
});

describe('writing in the group thread', () => {
  it("makes a member's own lesson once, on the first note, hidden from the lesson list", async () => {
    const { place, target } = await asBen();
    expect(place.own).toMatchObject({ groupLessonId: LESSON, title: 'The Good Shepherd' });
    expect(await db.lesson.get(place.ownLessonId)).toBeUndefined();

    const first = await addToThread(target, { body: text('Psalm 23') }, db);
    await addToThread(target, { body: text('And verse 4') }, db);
    const own = await db.lesson.get(place.ownLessonId);
    expect(own).toMatchObject({
      groupLessonId: LESSON,
      title: 'The Good Shepherd',
      seriesId: null,
    });
    expect(first).toMatchObject({
      lessonId: place.ownLessonId,
      visibility: 'group',
      groupId: GROUP,
      replyToId: null,
    });
    expect(first.sharedAt).not.toBeNull();
    expect(await db.outbox.where({ entity: 'lesson' }).count()).toBe(1);
    expect(await allLessons(db)).toEqual([]);
    // Once the device is out of the group, it's an ordinary lesson.
    await syncGroups(db, [], async () => page([], 1));
    expect((await allLessons(db)).map((l) => l.id)).toEqual([place.ownLessonId]);
    expect(await threadOf(own!, db)).toBeNull();
  });

  it('shows every member’s sections by when they were shared, replies under them', async () => {
    const { place, target } = await asBen([
      annSection(1, 'The door', { sharedAt: NOW }),
      annSection(2, 'Ann replies to herself', { parentId: id(1), sharedAt: LATER }),
    ]);
    const reply = await addToThread(target, { body: text('Like Psalm 23'), replyToId: id(1) }, db);
    const mine = await addToThread(target, { body: text('My own point') }, db);
    await createSection(
      {
        lessonId: place.ownLessonId,
        parentId: null,
        orderKey: 'a9',
        body: text('Private: not in the thread'),
        conflictOf: null,
        conflictDevice: null,
        sourceAt: null,
        sourcePage: null,
      },
      db,
    );
    await addComment(id(1), GROUP, 'And John 10:9', db);

    const view = await threadView(place, BEN, db);
    expect(view.items.map((item) => [item.entry.id, item.replies.map((r) => r.author)])).toEqual([
      [id(1), ['Ann', 'You']],
      [mine.id, []],
    ]);
    const [first] = view.items;
    expect(first?.entry).toMatchObject({ author: 'Ann', mine: false, section: null });
    expect(first?.replies[1]).toMatchObject({ id: reply.id, mine: true });
    expect(view.comments.get(id(1))?.map((c) => [c.author, c.body])).toEqual([
      ['You', commentBody('And John 10:9')],
    ]);
  });

  it('moves a section with its replies to my notes and back', async () => {
    const { target } = await asBen();
    const section = await addToThread(target, { body: text('Mine') }, db);
    const reply = await addToThread(target, { body: text('Under it'), parentId: section.id }, db);
    expect(await moveToMyNotes(section.id, db)).toEqual([section.id, reply.id]);
    for (const row of await db.section.bulkGet([section.id, reply.id])) {
      expect(row).toMatchObject({ visibility: 'private', groupId: null, sharedAt: null });
    }
    await shareWithGroup(section.id, GROUP, db);
    expect((await db.section.get(reply.id))?.visibility).toBe('group');
  });
});

const entry = (n: number, at: string, fields: Partial<ThreadEntry> = {}): ThreadEntry => ({
  id: id(n),
  userId: ANN,
  author: 'Ann',
  mine: false,
  sharedAt: at,
  parentId: null,
  replyToId: null,
  body: text(String(n)),
  answersQuestionId: null,
  answerKind: null,
  section: null,
  ...fields,
});

describe('threadItems', () => {
  it('puts a reply to a reply under the top section, and a stray reply on its own', () => {
    const items = threadItems([
      entry(3, '2026-10-19T09:03:00.000Z', { replyToId: id(2) }),
      entry(1, '2026-10-19T09:01:00.000Z'),
      entry(2, '2026-10-19T09:02:00.000Z', { parentId: id(1) }),
      entry(4, '2026-10-19T09:00:00.000Z', { replyToId: id(99) }),
    ]);
    expect(items.map((i) => [i.entry.id, i.replies.map((r) => r.id)])).toEqual([
      [id(4), []],
      [id(1), [id(2), id(3)]],
    ]);
  });
});

describe('group questions', () => {
  it('are open, partly answered or answered by the answers with text in the thread', async () => {
    const { place, target } = await asBen([
      {
        entity: 'question',
        addedRev: 1,
        row: {
          id: id(2),
          userId: ANN,
          groupLessonId: LESSON,
          text: 'Who are the other sheep?',
          createdAt: NOW,
          updatedAt: NOW,
        },
      },
      annSection(5, 'Partly: the Gentiles', {
        answersQuestionId: id(2),
        answerKind: 'partial',
        body: { ...headedBody('Who are the other sheep?'), content: [] },
      }),
    ]);
    const mine = await askInGroup(target, 'Why a gate, not a door?', db);
    expect(mine).toMatchObject({ visibility: 'group', groupId: GROUP });
    expect(await db.questionEntry.where({ questionId: mine.id }).count()).toBe(1);

    const status = async () =>
      Object.fromEntries(
        (await groupQuestionQueue(GROUP, BEN, db)).map((q) => [
          q.text,
          [q.status, q.answeredBy, q.author],
        ]),
      );
    // Ann's partial answer has only its heading: nothing answered yet.
    expect(await status()).toEqual({
      'Who are the other sheep?': ['open', [], 'Ann'],
      'Why a gate, not a door?': ['open', [], 'You'],
    });

    const answer = await answerInGroup(target, { id: mine.id, text: mine.text }, {}, db);
    expect(answer).toMatchObject({ answersQuestionId: mine.id, answerKind: 'full' });
    // Its heading alone isn't an answer.
    expect((await status())['Why a gate, not a door?']?.[0]).toBe('open');
    await db.section.put({
      ...answer,
      body: {
        type: 'doc',
        content: [...headedBody(mine.text).content.slice(0, 1), ...text('The sheepfold').content],
      },
    });
    expect((await status())['Why a gate, not a door?']).toEqual(['answered', ['You'], 'You']);

    await syncGroups(db, [{ id: GROUP, rev: 2 }], async () =>
      page(
        [
          annSection(5, 'Partly: the Gentiles', {
            answersQuestionId: id(2),
            answerKind: 'partial',
            body: {
              type: 'doc',
              content: [
                ...headedBody('Who are the other sheep?').content.slice(0, 1),
                ...text('The Gentiles').content,
              ],
            },
          }),
        ],
        2,
      ),
    );
    expect((await status())['Who are the other sheep?']).toEqual(['partial', ['Ann'], 'Ann']);
    expect((await threadView(place, BEN, db)).questions.map((q) => q.id)).toEqual([id(2), mine.id]);
  });
});

describe('threadOf', () => {
  it("finds the owner's lesson in a shared series, and nothing for a lesson in none", async () => {
    await syncGroups(db, [{ id: GROUP, rev: 1 }], async () => page(annRows, 1));
    const lesson = await createLesson(
      {
        id: LESSON,
        seriesId: SERIES,
        title: 'The Good Shepherd',
        date: '2026-10-12',
        kind: 'sermon',
        speaker: null,
        church: null,
        sourceType: null,
        sourceTitle: null,
        sourceAuthor: null,
        sourceUrl: null,
        sourceStartedAt: null,
        mainPassages: [],
      },
      db,
    );
    expect(await threadOf(lesson, db)).toEqual({
      groupId: GROUP,
      groupName: 'Thursday group',
      groupLessonId: LESSON,
      ownLessonId: LESSON,
      own: null,
    });
    const other = await createLesson({ ...lesson, id: undefined, seriesId: null }, db);
    expect(await threadOf(other, db)).toBeNull();
  });
});

describe('activity', () => {
  it("lists replies and comments to the user's sections, and others' questions, as new until seen", async () => {
    const { target } = await asBen();
    const mine = await addToThread(target, { body: text('Psalm 23') }, db);
    // What happened since: Ann replies to Ben's section, comments on it and asks a question; her
    // own section and a reply to it aren't for Ben.
    const later = (rows: GroupPulledRow[], rev: number) =>
      syncGroups(db, [{ id: GROUP, rev }], async () => page(rows, rev));
    const replyRow = annSection(5, 'Yes, the shepherd', { replyToId: mine.id, sharedAt: LATER });
    await later(
      [
        { ...replyRow, addedRev: 2 },
        { ...annSection(6, 'An aside', { sharedAt: LATER }), addedRev: 2 },
        {
          entity: 'comment',
          addedRev: 3,
          row: {
            id: id(7),
            userId: ANN,
            sectionId: mine.id,
            body: commentBody('Psalm 23:4 too'),
            createdAt: LATER,
            updatedAt: LATER,
          },
        },
        {
          entity: 'question',
          addedRev: 4,
          row: {
            id: id(8),
            userId: ANN,
            groupLessonId: LESSON,
            text: 'Why a gate?',
            createdAt: LATER,
            updatedAt: LATER,
          },
        },
      ],
      4,
    );
    const activity = await groupActivityOf(GROUP, BEN, db);
    expect(activity.items.map((i) => [i.kind, i.who, i.lessonTitle, i.isNew])).toEqual([
      ['question', 'Ann', 'The Good Shepherd', true],
      ['comment', 'Ann', 'The Good Shepherd', true],
      ['reply', 'Ann', 'The Good Shepherd', true],
    ]);
    expect(activity.fresh).toBe(3);
    expect((await freshByGroup(BEN, db)).get(GROUP)).toBe(3);

    // Opening the group: seen, as a visit that syncs.
    await markGroupSeen(GROUP, BEN, db);
    expect((await groupActivityOf(GROUP, BEN, db)).fresh).toBe(0);
    const visits = await db.outbox.where({ entity: 'groupVisit' }).toArray();
    expect(visits).toHaveLength(1);
    expect(await db.groupVisit.toArray()).toEqual([
      expect.objectContaining({ groupId: GROUP, seenRev: 4 }),
    ]);
    // Seen again with nothing new writes nothing.
    await markGroupSeen(GROUP, BEN, db);
    expect(await db.outbox.where({ entity: 'groupVisit' }).count()).toBe(1);

    // An edit doesn't make the reply new again; a new question is.
    await later(
      [
        {
          ...annSection(5, 'Yes, the good shepherd', { replyToId: mine.id, updatedAt: LATER }),
          addedRev: 2,
        },
        {
          entity: 'question',
          addedRev: 5,
          row: {
            id: id(9),
            userId: ANN,
            groupLessonId: LESSON,
            text: 'And the thief?',
            createdAt: LATER,
            updatedAt: LATER,
          },
        },
      ],
      5,
    );
    const after = await groupActivityOf(GROUP, BEN, db);
    expect(after.items.filter((i) => i.isNew).map((i) => i.text)).toEqual(['And the thief?']);
  });

  it('starts from when the user joined, so an old group doesn’t open with everything new', async () => {
    await syncGroups(db, [{ id: GROUP, rev: 9 }], async () =>
      page(
        [
          ...annRows.map((row) =>
            'row' in row && row.entity === 'member' && row.row.userId === BEN
              ? { ...row, addedRev: 9 }
              : row,
          ),
          {
            entity: 'question',
            addedRev: 4,
            row: {
              id: id(8),
              userId: ANN,
              groupLessonId: LESSON,
              text: 'Why a gate?',
              createdAt: NOW,
              updatedAt: NOW,
            },
          },
        ],
        9,
      ),
    );
    const activity = await groupActivityOf(GROUP, BEN, db);
    expect(activity.items).toHaveLength(1);
    expect(activity.fresh).toBe(0);
  });
});
