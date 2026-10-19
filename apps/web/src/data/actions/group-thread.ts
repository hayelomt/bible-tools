import {
  type AnswerKind,
  type Comment,
  commentBody,
  compareOrder,
  headedBody,
  keyBetween,
  type Question,
  type Section,
  type SectionBody,
} from '@lamp/domain';
import { action, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import type { OwnLesson } from '../group-thread.ts';
import { endOfLesson } from './section-order.ts';

/**
 * Writing in a group thread (F35, M13-08 to M13-10, §17.12). Everything is the user's own row, in
 * their own lesson for the group lesson (the group lesson itself for its owner), pushed as their
 * other notes are; the group's feed shows it to the members.
 */

/** Where a write in a thread goes: the user's lesson for it, made first when it's new. */
export interface ThreadTarget {
  groupId: string;
  lessonId: string;
  /** A member's own lesson not stored yet: made in the same action. */
  own: OwnLesson | null;
}

/** Makes a member's own lesson for a group lesson, once (decision 99); one deleted comes back. */
async function ensureOwn(w: Writer, own: OwnLesson | null): Promise<void> {
  if (!own) return;
  const stored = await w.db.lesson.get(own.id);
  if (stored?.deletedAt === null) return;
  if (stored) {
    await w.restore('lesson', own.id);
    return;
  }
  await w.create('lesson', {
    ...own,
    seriesId: null,
    sourceType: null,
    sourceTitle: null,
    sourceAuthor: null,
    sourceUrl: null,
    sourceStartedAt: null,
  });
}

/** Makes the user's own lesson for a group lesson before their first private note in it. */
export function ensureOwnLesson(own: OwnLesson, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => ensureOwn(w, own));
}

/** What a new section in the thread is: a reply, an answer, or neither. */
export interface ThreadSectionFields {
  id?: string;
  body: SectionBody;
  /** A reply to the user's own section: under it in their lesson, as a reply is. */
  parentId?: string | null;
  /** A reply to another member's section. */
  replyToId?: string | null;
  answersQuestionId?: string | null;
  answerKind?: AnswerKind | null;
}

async function addSection(
  w: Writer,
  target: ThreadTarget,
  fields: ThreadSectionFields,
): Promise<Section> {
  await ensureOwn(w, target.own);
  const parentId = fields.parentId ?? null;
  let orderKey: string;
  if (parentId) {
    const siblings = await w.db.section
      .where('parentId')
      .equals(parentId)
      .filter((s) => s.deletedAt === null)
      .toArray();
    orderKey = keyBetween(siblings.toSorted(compareOrder).at(-1)?.orderKey ?? null, null);
  } else {
    orderKey = await endOfLesson(w, target.lessonId);
  }
  return w.create('section', {
    id: fields.id,
    lessonId: target.lessonId,
    parentId,
    orderKey,
    body: fields.body,
    conflictOf: null,
    conflictDevice: null,
    sourceAt: null,
    sourcePage: null,
    visibility: 'group',
    groupId: target.groupId,
    sharedAt: w.now,
    replyToId: fields.replyToId ?? null,
    answersQuestionId: fields.answersQuestionId ?? null,
    answerKind: fields.answersQuestionId ? (fields.answerKind ?? 'full') : null,
  });
}

/** A new section in the group thread, at its end: a reply goes under what it replies to. */
export function addToThread(
  target: ThreadTarget,
  fields: ThreadSectionFields,
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, (w) => addSection(w, target, fields));
}

/** A section and its replies, live, the section first. */
async function withReplies(w: Writer, id: string): Promise<Section[]> {
  const section = await w.db.section.get(id);
  if (!section || section.deletedAt !== null) throw new RowNotFoundError('section', id);
  const replies = await w.db.section
    .where('parentId')
    .equals(id)
    .filter((s) => s.deletedAt === null)
    .toArray();
  return [section, ...replies];
}

/**
 * "Move to my notes" (wireframes/sharing.md): a group section and its replies become private notes
 * in the user's lesson; the group drops them at the next sync. Returns their ids, for Undo.
 */
export function moveToMyNotes(id: string, db: LampDb = appDb): Promise<string[]> {
  return action(db, async (w) => {
    const sections = await withReplies(w, id);
    for (const section of sections) {
      await w.update('section', section.id, {
        visibility: 'private',
        groupId: null,
        sharedAt: null,
      });
    }
    return sections.map((s) => s.id);
  });
}

/**
 * "Share with the group": a private section and its replies join the group thread, at its end (a
 * reply shares its parent's visibility). Returns their ids, for Undo.
 */
export function shareWithGroup(id: string, groupId: string, db: LampDb = appDb): Promise<string[]> {
  return action(db, async (w) => {
    const sections = await withReplies(w, id);
    for (const section of sections) {
      await w.update('section', section.id, { visibility: 'group', groupId, sharedAt: w.now });
    }
    return sections.map((s) => s.id);
  });
}

/** Undoes a move between the threads: the sections go back where they were. */
export function unshare(ids: readonly string[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const id of ids) {
      await w.update('section', id, { visibility: 'private', groupId: null, sharedAt: null });
    }
  });
}

export function reshare(
  ids: readonly string[],
  groupId: string,
  db: LampDb = appDb,
): Promise<void> {
  return action(db, async (w) => {
    for (const id of ids) {
      await w.update('section', id, { visibility: 'group', groupId, sharedAt: w.now });
    }
  });
}

/** A comment on a group section (M13-09), typed as plain text: its references become chips. */
export function addComment(
  sectionId: string,
  groupId: string,
  text: string,
  db: LampDb = appDb,
): Promise<Comment> {
  return action(db, (w) => w.create('comment', { sectionId, groupId, body: commentBody(text) }));
}

export function editComment(id: string, text: string, db: LampDb = appDb): Promise<Comment> {
  return action(db, (w) => w.update('comment', id, { body: commentBody(text) }));
}

/** Deletes at once; the comment offers Undo. */
export function removeComment(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('comment', id));
}

export function restoreComment(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('comment', id));
}

/** A question in the group thread (M13-10): in the group's queue, its thread the asker's own. */
export function askInGroup(
  target: ThreadTarget,
  text: string,
  db: LampDb = appDb,
): Promise<Question> {
  return action(db, async (w) => {
    await ensureOwn(w, target.own);
    const question = await w.create('question', {
      lessonId: target.lessonId,
      text,
      splitFromId: null,
      visibility: 'group',
      groupId: target.groupId,
    });
    await w.create('questionEntry', {
      questionId: question.id,
      lessonId: target.lessonId,
      kind: 'asked',
      sectionId: null,
    });
    return question;
  });
}

/**
 * "Answer" on a group question (wireframes/sharing.md): a new section at the end of the thread,
 * headed with the question, that answers it, fully or in part. It counts once it has text.
 */
export function answerInGroup(
  target: ThreadTarget,
  question: { id: string; text: string },
  { id, partial = false }: { id?: string; partial?: boolean } = {},
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, (w) =>
    addSection(w, target, {
      id,
      body: headedBody(question.text),
      answersQuestionId: question.id,
      answerKind: partial ? 'partial' : 'full',
    }),
  );
}
