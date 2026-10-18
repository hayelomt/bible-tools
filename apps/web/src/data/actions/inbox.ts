import {
  type InboxItem,
  type Lesson,
  newId,
  type Section,
  type SectionBody,
  type VerseRef,
} from '@lamp/domain';
import { type ImportedItem, importKey } from '@/import/youversion.ts';
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

/** An import in the inbox (wireframes/interop.md): one row for all its waiting items. */
export interface ImportGroup {
  importId: string;
  /** When the import ran: its items' `createdAt`, all written in one action. */
  importedAt: string;
  count: number;
}

export type InboxEntry = { kind: 'item'; item: InboxItem } | { kind: 'import'; group: ImportGroup };

/**
 * The inbox's list on `day`, newest first: each item by when it arrived, and each import as one
 * row by when it ran, so a thousand highlights don't bury this week's shares.
 */
export async function inboxEntries(day: string, db: LampDb = appDb): Promise<InboxEntry[]> {
  const entries: Array<InboxEntry & { at: string }> = [];
  const groups = new Map<string, ImportGroup>();
  for (const item of await inboxItems(day, db)) {
    if (item.importId === null) {
      entries.push({ kind: 'item', item, at: item.receivedAt });
      continue;
    }
    const group = groups.get(item.importId);
    if (group) {
      group.count++;
      continue;
    }
    const added = { importId: item.importId, importedAt: item.createdAt, count: 1 };
    groups.set(item.importId, added);
    entries.push({ kind: 'import', group: added, at: added.importedAt });
  }
  // Stable, so items keep `inboxItems`' order among themselves.
  return entries.toSorted((a, b) => b.at.localeCompare(a.at)).map(({ at: _at, ...entry }) => entry);
}

/** One import's screen: when it ran, and its items waiting on `day`, oldest first by their dates. */
export interface ImportItems {
  importedAt: string;
  items: InboxItem[];
}

/** An import's items; null for an import this device has never had. */
export async function importItems(
  importId: string,
  day: string,
  db: LampDb = appDb,
): Promise<ImportItems | null> {
  const all = await db.inboxItem.where('importId').equals(importId).toArray();
  if (all.length === 0) return null;
  const items = all
    .filter((item) => isWaiting(item, day))
    .toSorted((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id));
  return { importedAt: all[0]!.createdAt, items };
}

/** How many items wait on `day`: the Inbox tab's badge. */
export function inboxCount(day: string, db: LampDb = appDb): Promise<number> {
  return db.inboxItem.filter((item) => isWaiting(item, day)).count();
}

export type NewInboxItem = Pick<NewRow<'inboxItem'>, 'origin' | 'ref' | 'text'> &
  Partial<NewRow<'inboxItem'>>;

/** Puts a verse or a note in the inbox, received now unless the item says when. */
export function addInboxItem(fields: NewInboxItem, db: LampDb = appDb): Promise<InboxItem> {
  return action(db, (w) => createItem(w, fields));
}

function createItem(w: Writer, fields: NewInboxItem): Promise<InboxItem> {
  return w.create('inboxItem', {
    sourceUrl: null,
    colour: null,
    importId: null,
    snoozedUntil: null,
    placedInSectionId: null,
    receivedAt: w.now,
    ...fields,
  });
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
    const lesson = await targetLesson(w, target, [item]);
    const section = await placeAtEnd(w, item, lesson);
    return { kind: 'section', itemId: id, lesson, section, newLesson: !('lessonId' in target) };
  });
}

/** The lesson chosen, or a new one for `items`: personal, titled from the first, with their passages. */
async function targetLesson(
  w: Writer,
  target: PromoteTarget,
  items: ReadonlyArray<Pick<InboxItem, 'ref' | 'text'>>,
): Promise<Lesson> {
  if ('lessonId' in target) return liveLesson(w, target.lessonId);
  const mainPassages = items.flatMap((item) => {
    if (!item.ref) return [];
    const { snapshotText: _text, ...passage } = item.ref;
    return [passage as VerseRef];
  });
  return w.create('lesson', {
    seriesId: null,
    title: inboxItemTitle(items[0]!),
    date: target.newLesson.date,
    kind: 'personal',
    speaker: null,
    church: null,
    mainPassages,
  });
}

/** A new top-level section at the end of the lesson holding the item, which is then placed. */
async function placeAtEnd(w: Writer, item: InboxItem, lesson: Lesson): Promise<Section> {
  const section = await w.create('section', {
    lessonId: lesson.id,
    parentId: null,
    orderKey: await endOfLesson(w, lesson.id),
    body: inboxItemBody(item),
    conflictOf: null,
    conflictDevice: null,
  });
  await w.update('inboxItem', item.id, { placedInSectionId: section.id });
  return section;
}

/** What a share or a paste saved (M9-06), for Undo. */
export interface Shared {
  items: InboxItem[];
  /** Where they went, when they went straight to a lesson. */
  lesson: Lesson | null;
  newLesson: boolean;
  sections: Section[];
}

/**
 * Saves what the share screen found (F18, M9-06): its items in the inbox, or, with a target,
 * each as a section at the end of that lesson (or a new one), placed as Send to lesson places
 * them, so they're out of the inbox. One action, so Undo takes all of it back.
 */
export function addShared(
  items: readonly NewInboxItem[],
  target: PromoteTarget | null,
  db: LampDb = appDb,
): Promise<Shared> {
  return action(db, async (w) => {
    // Made last first: items received together list newest id first, so the inbox shows them in
    // the order they were shared.
    const added: InboxItem[] = [];
    for (const fields of items.toReversed()) added.unshift(await createItem(w, fields));
    if (!target) return { items: added, lesson: null, newLesson: false, sections: [] };
    const lesson = await targetLesson(w, target, added);
    const sections: Section[] = [];
    for (const item of added) sections.push(await placeAtEnd(w, item, lesson));
    return { items: added, lesson, newLesson: !('lessonId' in target), sections };
  });
}

/**
 * Undo for `addShared`: the items are gone again, with the sections they made (and a lesson made
 * for them), except a section edited since, which stays.
 */
export function undoShared(shared: Shared, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    let kept = false;
    for (const made of shared.sections) {
      const section = await w.db.section.get(made.id);
      if (section?.deletedAt === null && section.updatedAt === made.updatedAt) {
        await w.remove('section', section.id);
      } else if (section?.deletedAt === null) kept = true;
    }
    if (shared.newLesson && shared.lesson && !kept) await w.remove('lesson', shared.lesson.id);
    for (const item of shared.items) await w.remove('inboxItem', item.id);
  });
}

/** What an import added (M9-11). */
export interface Imported {
  importId: string;
  added: number;
  /** Already in the inbox, placed or dismissed (§17.2), or twice in the file. */
  skipped: number;
}

/**
 * Puts imported highlights and notes in the inbox (F21, M9-11), in one action, all with one
 * `importId` so the import can be dismissed together (M9-12). An item matching one already there
 * by passage, date and text (§17.2), placed and dismissed ones included, is skipped.
 */
export function importInboxItems(
  items: readonly ImportedItem[],
  db: LampDb = appDb,
): Promise<Imported> {
  return action(db, async (w) => {
    const importId = newId();
    const seen = new Set((await w.db.inboxItem.toArray()).map(importKey));
    let added = 0;
    for (const item of items) {
      const key = importKey(item);
      if (seen.has(key)) continue;
      seen.add(key);
      await createItem(w, { origin: 'import', importId, ...item });
      added++;
    }
    return { importId, added, skipped: items.length - added };
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

/** Not placed and not dismissed: what "Dismiss all from this import" takes, snoozed ones too. */
const leftOver = (item: InboxItem) => item.deletedAt === null && item.placedInSectionId === null;

/** How many items "Dismiss all from this import" would take, for its question. */
export async function importLeftCount(importId: string, db: LampDb = appDb): Promise<number> {
  return db.inboxItem.where('importId').equals(importId).filter(leftOver).count();
}

/**
 * "Dismiss all from this import…" (M9-12): every item of the import not yet placed, in one action.
 * Placed items stay in their lessons, and other items aren't touched. Returns the ids dismissed,
 * for Undo.
 */
export function dismissImport(importId: string, db: LampDb = appDb): Promise<string[]> {
  return action(db, async (w) => {
    const items = await w.db.inboxItem
      .where('importId')
      .equals(importId)
      .filter(leftOver)
      .toArray();
    for (const item of items) await w.remove('inboxItem', item.id);
    return items.map((item) => item.id);
  });
}

/** Undo for `dismissImport`: those items are back, and no others. */
export function restoreInboxItems(ids: readonly string[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const id of ids) await w.restore('inboxItem', id);
  });
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
