import type { InboxItem, Lesson, Section, SectionBody, VerseRef } from '@lamp/domain';
import { action, type NewRow, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import { highlightBody, type PromoteTarget } from './highlights.ts';
import { endOfLesson } from './section-order.ts';

/**
 * The inbox (F17, TECH-DESIGN §17.2): verses and notes waiting to be put in a lesson. Placing an
 * item adds a section, or adds to one, and sets `placedInSectionId`; Undo reverses both.
 * Dismissing is a tombstone, and Undo restores it.
 */

/** Whether the item waits in the inbox on `day`: live, not placed, and not snoozed past it. */
export const isWaiting = (item: InboxItem, day: string): boolean =>
  item.deletedAt === null &&
  item.placedInSectionId === null &&
  (item.snoozedUntil === null || item.snoozedUntil <= day);

/** The items waiting on `day`, newest first. */
export async function inboxItems(day: string, db: LampDb = appDb): Promise<InboxItem[]> {
  const items = await db.inboxItem.filter((item) => isWaiting(item, day)).toArray();
  // Items that arrived in the same millisecond keep one order.
  return items.toSorted(
    (a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id),
  );
}

/** How many items wait on `day`: the Inbox tab's badge. */
export function inboxCount(day: string, db: LampDb = appDb): Promise<number> {
  return db.inboxItem.filter((item) => isWaiting(item, day)).count();
}

export type NewInboxItem = Pick<NewRow<'inboxItem'>, 'origin' | 'ref' | 'text'> &
  Partial<NewRow<'inboxItem'>>;

/** Puts a verse or a note in the inbox, received now unless the item says when. */
export function addInboxItem(fields: NewInboxItem, db: LampDb = appDb): Promise<InboxItem> {
  return action(db, (w) =>
    w.create('inboxItem', {
      sourceUrl: null,
      colour: null,
      importId: null,
      snoozedUntil: null,
      placedInSectionId: null,
      receivedAt: w.now,
      ...fields,
    }),
  );
}

/** What an item becomes in a section: the chip, then the text a paragraph a line. */
export function inboxItemBody(item: Pick<InboxItem, 'ref' | 'text'>): SectionBody {
  if (item.ref) return highlightBody(item.ref, item.text);
  const lines = (item.text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return {
    type: 'doc',
    content: lines.map((text) => ({ type: 'paragraph', content: [{ type: 'text', text }] })),
  };
}

/** A new lesson's title from an item: the reference, or the text's first line. */
export function inboxItemTitle(item: Pick<InboxItem, 'ref' | 'text'>): string {
  if (item.ref) return item.ref.display;
  const line = (item.text ?? '').trim().split('\n')[0]!.trim();
  return line.length > 80 ? `${line.slice(0, 79).trimEnd()}…` : line;
}

/** How an item was placed, for Undo. */
export type Placement =
  | { kind: 'section'; itemId: string; lesson: Lesson; section: Section; newLesson: boolean }
  | { kind: 'append'; itemId: string; lesson: Lesson; section: Section; before: SectionBody };

/**
 * "Send to lesson" (wireframes/interop.md): a new top-level section at the end of the lesson,
 * the chip then the text. A new lesson is personal, dated `date`, titled from the item, with its
 * passage as the main passage, as when a highlight is promoted.
 */
export function sendToLesson(
  id: string,
  target: PromoteTarget,
  db: LampDb = appDb,
): Promise<Placement> {
  return action(db, async (w) => {
    const item = await waitingItem(w, id);
    let lesson: Lesson;
    if ('lessonId' in target) {
      lesson = await liveLesson(w, target.lessonId);
    } else {
      const { snapshotText: _text, ...passage } = item.ref ?? {};
      lesson = await w.create('lesson', {
        seriesId: null,
        title: inboxItemTitle(item),
        date: target.newLesson.date,
        source: 'personal',
        speaker: null,
        church: null,
        mainPassages: item.ref ? [passage as VerseRef] : [],
      });
    }
    const section = await w.create('section', {
      lessonId: lesson.id,
      parentId: null,
      orderKey: await endOfLesson(w, lesson.id),
      body: inboxItemBody(item),
      conflictOf: null,
      conflictDevice: null,
    });
    await w.update('inboxItem', id, { placedInSectionId: section.id });
    return { kind: 'section', itemId: id, lesson, section, newLesson: !('lessonId' in target) };
  });
}

/** "Append to a section": the item goes at the end of the section's text. */
export function appendToSection(
  id: string,
  sectionId: string,
  db: LampDb = appDb,
): Promise<Placement> {
  return action(db, async (w) => {
    const item = await waitingItem(w, id);
    const current = await w.db.section.get(sectionId);
    if (!current || current.deletedAt !== null) throw new RowNotFoundError('section', sectionId);
    const lesson = await liveLesson(w, current.lessonId);
    const body: SectionBody = {
      type: 'doc',
      content: [...current.body.content, ...inboxItemBody(item).content],
    };
    const section = await w.update('section', sectionId, { body });
    await w.update('inboxItem', id, { placedInSectionId: sectionId });
    return { kind: 'append', itemId: id, lesson, section, before: current.body };
  });
}

/**
 * Undo for a placement: the item is back in the inbox, and the section it made is removed (with
 * a lesson made for it), or the section it was added to gets its text back. A section edited
 * since keeps the edit, and only the item comes back.
 */
export function undoPlacement(placement: Placement, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const section = await w.db.section.get(placement.section.id);
    const untouched =
      section?.deletedAt === null && section.updatedAt === placement.section.updatedAt;
    if (untouched && placement.kind === 'section') {
      await w.remove('section', section.id);
      if (placement.newLesson) await w.remove('lesson', placement.lesson.id);
    } else if (untouched && placement.kind === 'append') {
      await w.update('section', section.id, { body: placement.before });
    }
    await w.update('inboxItem', placement.itemId, { placedInSectionId: null });
  });
}

/** Dismisses at once; the toast offers Undo (UX-PATTERNS "Confirmations"). */
export function dismissInboxItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.remove('inboxItem', id));
}

export function restoreInboxItem(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, (w) => w.restore('inboxItem', id));
}

async function waitingItem(w: Writer, id: string): Promise<InboxItem> {
  const item = await w.db.inboxItem.get(id);
  if (!item || item.deletedAt !== null) throw new RowNotFoundError('inboxItem', id);
  return item;
}

async function liveLesson(w: Writer, id: string): Promise<Lesson> {
  const lesson = await w.db.lesson.get(id);
  if (!lesson || lesson.deletedAt !== null) throw new RowNotFoundError('lesson', id);
  return lesson;
}
