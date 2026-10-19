import type {
  AnswerKind,
  CommentBody,
  GroupLesson,
  Lesson,
  Section,
  SectionBody,
} from '@lamp/domain';
import { db as appDb, type InGroup, type LampDb } from './db.ts';
import { hasAnswer } from './question-view.ts';

/**
 * Group threads on the device (F35, M13-08 to M13-10, §17.12). Other members' rows come from the
 * group stores; the user's own from their own tables, so what they type shows at once, offline too.
 */

/** What a member's own lesson for a group lesson is made with, on their first note (decision 99). */
export type OwnLesson = Pick<
  Lesson,
  'id' | 'groupLessonId' | 'title' | 'date' | 'kind' | 'speaker' | 'church' | 'mainPassages'
>;

/** Where a lesson's group thread is. */
export interface ThreadPlace {
  groupId: string;
  groupName: string;
  /** The lesson the thread is on: the series owner's. */
  groupLessonId: string;
  /** The user's lesson that holds their part of it: the group lesson itself, for its owner. */
  ownLessonId: string;
  /** A member's own lesson, until it's stored; null once it is, and for the owner. */
  own: OwnLesson | null;
}

/** A member's own lesson for a group lesson, with the group lesson's details. */
export function ownLessonFor(id: string, groupLesson: GroupLesson): OwnLesson {
  return {
    id,
    groupLessonId: groupLesson.id,
    title: groupLesson.title,
    date: groupLesson.date,
    kind: groupLesson.kind,
    speaker: groupLesson.speaker,
    church: groupLesson.church,
    mainPassages: groupLesson.mainPassages,
  };
}

/**
 * A lesson's group thread, if it has one: the owner's lesson in a shared series, or a member's own
 * lesson for a group lesson the device has. Null for any other lesson, and once the group is gone,
 * when its group sections read as the user's own notes.
 */
export async function threadOf(lesson: Lesson, db: LampDb = appDb): Promise<ThreadPlace | null> {
  const groupLesson = lesson.groupLessonId
    ? await db.groupLesson.get(lesson.groupLessonId)
    : lesson.seriesId && (await db.groupSeries.get(lesson.seriesId))
      ? await db.groupLesson.get(lesson.id)
      : undefined;
  if (!groupLesson) return null;
  const group = await db.group.get(groupLesson.groupId);
  if (!group) return null;
  return {
    groupId: group.id,
    groupName: group.name,
    groupLessonId: groupLesson.id,
    ownLessonId: lesson.id,
    own: null,
  };
}

/** A member's thread on another member's lesson, their own lesson made on their first note. */
export async function memberThread(
  groupLesson: InGroup<GroupLesson>,
  ownId: string,
  db: LampDb = appDb,
): Promise<ThreadPlace | null> {
  const group = await db.group.get(groupLesson.groupId);
  if (!group) return null;
  const own = await db.lesson.get(ownId);
  return {
    groupId: group.id,
    groupName: group.name,
    groupLessonId: groupLesson.id,
    ownLessonId: ownId,
    own: own && own.deletedAt === null ? null : ownLessonFor(ownId, groupLesson),
  };
}

/** A section in a group thread, anyone's. */
export interface ThreadEntry {
  id: string;
  userId: string;
  /** The author's name in the group; "You" for the user. */
  author: string;
  mine: boolean;
  sharedAt: string;
  parentId: string | null;
  replyToId: string | null;
  body: SectionBody;
  answersQuestionId: string | null;
  answerKind: AnswerKind | null;
  /** The user's own stored row, which they edit; null for another member's. */
  section: Section | null;
}

/** A top-level section of the thread and what's under it, by when each was shared. */
export interface ThreadItem {
  entry: ThreadEntry;
  replies: ThreadEntry[];
}

export interface ThreadComment {
  id: string;
  sectionId: string;
  userId: string;
  author: string;
  mine: boolean;
  body: CommentBody;
  createdAt: string;
}

/** Where a group question stands, from the group sections that answer it (decided 2026-10-19). */
export type GroupQuestionStatus = 'open' | 'partial' | 'answered';

export interface ThreadQuestion {
  id: string;
  userId: string;
  author: string;
  mine: boolean;
  text: string;
  createdAt: string;
  groupLessonId: string;
  /** The group lesson's title, for the queue. */
  lessonTitle: string;
  /** Who the group lesson belongs to: its owner opens it as their own lesson. */
  lessonOwnerId: string | null;
  status: GroupQuestionStatus;
  /** Who answered it (fully, or partly while it's partial), first answer first. */
  answeredBy: string[];
  /** When its first full answer was shared. */
  answeredAt: string | null;
}

export interface ThreadView {
  items: ThreadItem[];
  /** Each section's comments, oldest first. */
  comments: Map<string, ThreadComment[]>;
  /** The lesson's group questions, oldest first. */
  questions: ThreadQuestion[];
}

const live = (row: { deletedAt: string | null }) => row.deletedAt === null;

/** The group's names for its members, with the user as "You". */
async function namesIn(db: LampDb, groupId: string, me: string): Promise<Map<string, string>> {
  const members = await db.groupMember.where({ groupId }).toArray();
  return new Map(members.map((m) => [m.userId, m.userId === me ? 'You' : m.displayName]));
}

/** A member who left is named as such: their rows go at their next sync, but may show till then. */
const nameOf = (names: Map<string, string>, userId: string) =>
  names.get(userId) ?? 'A former member';

/** Every group section of the group: others' from its store, the user's from their own. */
async function groupSections(
  db: LampDb,
  groupId: string,
  me: string,
  names: Map<string, string>,
): Promise<(ThreadEntry & { groupLessonId: string })[]> {
  const others = (await db.groupSection.where({ groupId }).toArray()).filter(
    (s) => s.userId !== me,
  );
  const mine = await db.section
    .where('groupId')
    .equals(groupId)
    .filter((s) => live(s) && s.visibility === 'group')
    .toArray();
  const lessons = new Map(
    (await db.lesson.bulkGet([...new Set(mine.map((s) => s.lessonId))]))
      .filter((l) => l !== undefined)
      .map((l) => [l.id, l]),
  );
  return [
    ...others.map((s) => ({
      id: s.id,
      userId: s.userId,
      author: nameOf(names, s.userId),
      mine: false,
      sharedAt: s.sharedAt ?? s.createdAt,
      parentId: s.parentId,
      replyToId: s.replyToId,
      body: s.body,
      answersQuestionId: s.answersQuestionId,
      answerKind: s.answerKind,
      section: null,
      groupLessonId: s.groupLessonId,
    })),
    ...mine.flatMap((s) => {
      const lesson = lessons.get(s.lessonId);
      if (!lesson || !live(lesson)) return [];
      return [
        {
          id: s.id,
          userId: me,
          author: 'You',
          mine: true,
          sharedAt: s.sharedAt ?? s.createdAt,
          parentId: s.parentId,
          replyToId: s.replyToId,
          body: s.body,
          answersQuestionId: s.answersQuestionId,
          answerKind: s.answerKind,
          section: s,
          groupLessonId: lesson.groupLessonId ?? lesson.id,
        },
      ];
    }),
  ];
}

const bySharing = (a: ThreadEntry, b: ThreadEntry) =>
  a.sharedAt.localeCompare(b.sharedAt) || a.id.localeCompare(b.id);

/**
 * The thread's sections as the wireframe lays them out: each top-level section by when it was
 * shared, with what replies to it (or to one of its replies) under it. A reply to a section that
 * left the thread stands on its own.
 */
export function threadItems(entries: readonly ThreadEntry[]): ThreadItem[] {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const topOf = (entry: ThreadEntry): ThreadEntry => {
    let at = entry;
    for (let depth = 0; depth < 10; depth++) {
      const above = byId.get(at.parentId ?? at.replyToId ?? '');
      if (!above) return at;
      at = above;
    }
    return at;
  };
  const items = new Map<string, ThreadItem>();
  for (const entry of entries.toSorted(bySharing)) {
    const top = topOf(entry);
    if (top === entry) items.set(entry.id, { entry, replies: items.get(entry.id)?.replies ?? [] });
    else {
      const item = items.get(top.id) ?? { entry: top, replies: [] };
      item.replies.push(entry);
      items.set(top.id, item);
    }
  }
  return [...items.values()].toSorted((a, b) => bySharing(a.entry, b.entry));
}

/** Every group question of the group, with where it stands. */
async function groupQuestions(
  db: LampDb,
  groupId: string,
  me: string,
  names: Map<string, string>,
  sections: readonly (ThreadEntry & { groupLessonId: string })[],
): Promise<ThreadQuestion[]> {
  const others = (await db.groupQuestion.where({ groupId }).toArray()).filter(
    (q) => q.userId !== me,
  );
  const mine = await db.question
    .where('groupId')
    .equals(groupId)
    .filter((q) => live(q) && q.visibility === 'group')
    .toArray();
  const lessons = new Map(
    (await db.lesson.bulkGet([...new Set(mine.map((q) => q.lessonId))]))
      .filter((l) => l !== undefined)
      .map((l) => [l.id, l]),
  );
  const asked = [
    ...others.map((q) => ({ ...q, mine: false })),
    ...mine.flatMap((q) => {
      const lesson = lessons.get(q.lessonId);
      if (!lesson || !live(lesson)) return [];
      return [{ ...q, userId: me, mine: true, groupLessonId: lesson.groupLessonId ?? lesson.id }];
    }),
  ];
  const groupLessons = new Map(
    (await db.groupLesson.bulkGet([...new Set(asked.map((q) => q.groupLessonId))]))
      .filter((l) => l !== undefined)
      .map((l) => [l.id, l]),
  );
  return asked
    .flatMap((q) => {
      const groupLesson = groupLessons.get(q.groupLessonId);
      if (!groupLesson) return [];
      const answers = sections
        .filter((s) => s.answersQuestionId === q.id && hasAnswer(s.body))
        .toSorted(bySharing);
      const full = answers.filter((s) => s.answerKind !== 'partial');
      const counted = full.length > 0 ? full : answers;
      return [
        {
          id: q.id,
          userId: q.userId,
          author: q.mine ? 'You' : nameOf(names, q.userId),
          mine: q.mine,
          text: q.text,
          createdAt: q.createdAt,
          groupLessonId: q.groupLessonId,
          lessonTitle: groupLesson.title,
          lessonOwnerId: groupLesson.userId,
          status: full.length > 0 ? 'answered' : answers.length > 0 ? 'partial' : 'open',
          answeredBy: [...new Set(counted.map((s) => s.author))],
          answeredAt: full[0]?.sharedAt ?? null,
        } satisfies ThreadQuestion,
      ];
    })
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** A lesson's group thread: its sections, their comments and its group questions. */
export async function threadView(
  place: Pick<ThreadPlace, 'groupId' | 'groupLessonId'>,
  me: string,
  db: LampDb = appDb,
): Promise<ThreadView> {
  const { groupId, groupLessonId } = place;
  const names = await namesIn(db, groupId, me);
  const sections = await groupSections(db, groupId, me, names);
  const here = sections.filter((s) => s.groupLessonId === groupLessonId);
  const ids = new Set(here.map((s) => s.id));
  const others = (await db.groupComment.where({ groupId }).toArray()).filter(
    (c) => c.userId !== me && ids.has(c.sectionId),
  );
  const mine = (await db.comment.where('groupId').equals(groupId).toArray()).filter(
    (c) => live(c) && ids.has(c.sectionId),
  );
  const comments = new Map<string, ThreadComment[]>();
  const all = [
    ...others.map((row) => ({ ...row, author: nameOf(names, row.userId), mine: false })),
    ...mine.map((row) => ({ ...row, userId: me, author: 'You', mine: true })),
  ];
  for (const c of all.toSorted(
    (a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )) {
    const list = comments.get(c.sectionId) ?? [];
    list.push({
      id: c.id,
      sectionId: c.sectionId,
      userId: c.userId,
      author: c.author,
      mine: c.mine,
      body: c.body,
      createdAt: c.createdAt,
    });
    comments.set(c.sectionId, list);
  }
  const questions = (await groupQuestions(db, groupId, me, names, sections)).filter(
    (q) => q.groupLessonId === groupLessonId,
  );
  return { items: threadItems(here), comments, questions };
}

/** The group's questions queue (M13-10): every group question across its series. */
export async function groupQuestionQueue(
  groupId: string,
  me: string,
  db: LampDb = appDb,
): Promise<ThreadQuestion[]> {
  const names = await namesIn(db, groupId, me);
  const sections = await groupSections(db, groupId, me, names);
  return groupQuestions(db, groupId, me, names, sections);
}

/** Group lessons the device has: the user's own lessons for them stay off the Lessons home. */
export async function groupLessonIds(db: LampDb = appDb): Promise<Set<string>> {
  return new Set(await db.groupLesson.toCollection().primaryKeys());
}
