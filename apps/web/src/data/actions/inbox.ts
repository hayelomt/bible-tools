import {
  type InboxItem,
  type Lesson,
  newId,
  type Question,
  type Section,
  type SectionBody,
  type Tag,
  type Takeaway,
  type VerseRef,
} from '@lamp/domain';
import { type ImportedItem, importKey } from '@/import/youversion.ts';
import { action, type NewRow, RowNotFoundError, type Writer } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import { highlightBody, type PromoteTarget } from './highlights.ts';
import { endOfLesson } from './section-order.ts';
import { ensureTag, liveLinksOf, type TagLink, tagNamed } from './tags.ts';

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

/** An item that became a section of its own, for Undo: the section and the tags it took on. */
export interface PlacedItem {
  itemId: string;
  section: Section;
  tags: TagLink[];
}

/** What "Make a takeaway" or "Make a question" made besides the section (M11-03). */
export type Promoted =
  { kind: 'takeaway'; takeaway: Takeaway } | { kind: 'question'; question: Question };

/** How items were placed, for Undo. */
export type Placement =
  | {
      kind: 'sections';
      lesson: Lesson;
      newLesson: boolean;
      placed: PlacedItem[];
      promoted: Promoted | null;
    }
  | {
      kind: 'append';
      itemId: string;
      lesson: Lesson;
      section: Section;
      before: SectionBody;
      tags: TagLink[];
    };

/**
 * "Send to lesson" (wireframes/interop.md, M11-02 for several): each item a new top-level section
 * at the end of the lesson, the chip then the text, in the order they were received. A new lesson
 * is personal, dated `date`, titled from the first item unless the target names it, with their
 * passages as its main passages, as when a highlight is promoted. One action, so one Undo.
 */
export function sendToLesson(
  ids: readonly string[],
  target: PromoteTarget,
  db: LampDb = appDb,
): Promise<Placement & { kind: 'sections' }> {
  return action(db, async (w) => {
    const items = await waitingItems(w, ids);
    const lesson = await targetLesson(w, target, items);
    const placed: PlacedItem[] = [];
    for (const item of items) placed.push(await placeAtEnd(w, item, lesson));
    return { kind: 'sections', lesson, newLesson: !('lessonId' in target), placed, promoted: null };
  });
}

/**
 * "Make a takeaway" and "Make a question" (M11-03): the text, edited first, becomes a takeaway or
 * a question of the lesson, and the item goes in as a section as "Send to lesson" puts it, so its
 * chip stays cited (decided 2026-10-19). One action, so Undo takes back both.
 */
export function promoteInboxItem(
  id: string,
  target: PromoteTarget,
  as: Promoted['kind'],
  text: string,
  db: LampDb = appDb,
): Promise<Placement & { kind: 'sections' }> {
  return action(db, async (w) => {
    const [item] = await waitingItems(w, [id]);
    const lesson = await targetLesson(w, target, [item!]);
    const placed = [await placeAtEnd(w, item!, lesson)];
    let promoted: Promoted;
    if (as === 'takeaway') {
      promoted = {
        kind: 'takeaway',
        takeaway: await w.create('takeaway', { lessonId: lesson.id, text }),
      };
    } else {
      const question = await w.create('question', { lessonId: lesson.id, text, splitFromId: null });
      await w.create('questionEntry', {
        questionId: question.id,
        lessonId: lesson.id,
        kind: 'asked',
        sectionId: null,
      });
      promoted = { kind: 'question', question };
    }
    return { kind: 'sections', lesson, newLesson: !('lessonId' in target), placed, promoted };
  });
}

/** What "Make a takeaway" or "Make a question" starts from: the item's text, else its reference. */
export function promoteText(item: Pick<InboxItem, 'ref' | 'text'>): string {
  const text = (item.text ?? '').replace(/\s+/g, ' ').trim();
  return (text || item.ref?.display || '').slice(0, 2000);
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
    title: target.newLesson.title?.trim() || inboxItemTitle(items[0]!),
    date: target.newLesson.date,
    kind: 'personal',
    speaker: null,
    church: null,
    sourceType: null,
    sourceTitle: null,
    sourceAuthor: null,
    sourceUrl: null,
    sourceStartedAt: null,
    // A lesson has up to 20; the rest are cited by their sections.
    mainPassages: mainPassages.slice(0, 20),
  });
}

/**
 * A new top-level section at the end of the lesson holding the item, which is then placed. The
 * item's tags go onto the section (§17.2).
 */
async function placeAtEnd(w: Writer, item: InboxItem, lesson: Lesson): Promise<PlacedItem> {
  const section = await w.create('section', {
    lessonId: lesson.id,
    parentId: null,
    orderKey: await endOfLesson(w, lesson.id),
    body: inboxItemBody(item),
    conflictOf: null,
    conflictDevice: null,
    sourceAt: null,
    sourcePage: null,
  });
  await w.update('inboxItem', item.id, { placedInSectionId: section.id });
  return { itemId: item.id, section, tags: await moveTags(w, item.id, section.id) };
}

/** Puts the item's tags on the section too; the links made, for Undo. */
async function moveTags(w: Writer, itemId: string, sectionId: string): Promise<TagLink[]> {
  const made: TagLink[] = [];
  const links = await liveLinksOf(w.db, { kind: 'inboxItem', id: itemId }).toArray();
  for (const link of links) {
    const tag = await w.db.tag.get(link.tagId);
    if (tag?.deletedAt !== null) continue;
    const added = await ensureTag(w, { kind: 'section', id: sectionId }, link.tagId);
    if (added) made.push(added);
  }
  return made;
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
    for (const item of added) sections.push((await placeAtEnd(w, item, lesson)).section);
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

/** "Append to a section": the item goes at the end of the section's text, with its tags. */
export function appendToSection(
  id: string,
  sectionId: string,
  db: LampDb = appDb,
): Promise<Placement> {
  return action(db, async (w) => {
    const [item] = await waitingItems(w, [id]);
    const current = await w.db.section.get(sectionId);
    if (!current || current.deletedAt !== null) throw new RowNotFoundError('section', sectionId);
    const lesson = await liveLesson(w, current.lessonId);
    const body: SectionBody = {
      type: 'doc',
      content: [...current.body.content, ...inboxItemBody(item!).content],
    };
    const section = await w.update('section', sectionId, { body });
    await w.update('inboxItem', id, { placedInSectionId: sectionId });
    const tags = await moveTags(w, id, sectionId);
    return { kind: 'append', itemId: id, lesson, section, before: current.body, tags };
  });
}

/**
 * Undo for a placement: the items are back in the inbox, and each section one made is removed
 * with the tags it took on (and a lesson made for them), or the section one was added to gets its
 * text back. A section edited since keeps the edit, and only its item comes back. A takeaway or a
 * question made with it goes.
 */
export function undoPlacement(placement: Placement, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const untouched = async (made: Section) => {
      const section = await w.db.section.get(made.id);
      return section?.deletedAt === null && section.updatedAt === made.updatedAt;
    };
    const untag = async (links: readonly TagLink[]) => {
      for (const link of links) await w.remove(link.entity, link.id);
    };
    if (placement.kind === 'append') {
      if (await untouched(placement.section)) {
        await w.update('section', placement.section.id, { body: placement.before });
        await untag(placement.tags);
      }
      await w.update('inboxItem', placement.itemId, { placedInSectionId: null });
      return;
    }
    let kept = false;
    for (const { itemId, section, tags } of placement.placed) {
      if (await untouched(section)) {
        await untag(tags);
        await w.remove('section', section.id);
      } else kept = true;
      await w.update('inboxItem', itemId, { placedInSectionId: null });
    }
    const { promoted } = placement;
    if (promoted?.kind === 'takeaway') await w.remove('takeaway', promoted.takeaway.id);
    if (promoted?.kind === 'question') {
      const entries = await w.db.questionEntry
        .where('questionId')
        .equals(promoted.question.id)
        .primaryKeys();
      for (const entry of entries) await w.remove('questionEntry', entry);
      await w.remove('question', promoted.question.id);
    }
    if (placement.newLesson && !kept) await w.remove('lesson', placement.lesson.id);
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

/**
 * Dismisses the selected items at once (M11-02): the selection is the confirmation. Returns the
 * ids dismissed, for Undo (`restoreInboxItems`).
 */
export function dismissInboxItems(ids: readonly string[], db: LampDb = appDb): Promise<string[]> {
  return action(db, async (w) => {
    const items = await waitingItems(w, ids);
    for (const item of items) await w.remove('inboxItem', item.id);
    return items.map((item) => item.id);
  });
}

/** What tagging items did, for Undo. */
export interface ItemsTagged {
  tag: Tag;
  /** The links made; an item that had the tag already has none. */
  links: TagLink[];
}

/** "Tag" (M11-02): the tag, by name, on each item; placing an item takes it into its section. */
export function tagInboxItems(
  ids: readonly string[],
  name: string,
  db: LampDb = appDb,
): Promise<ItemsTagged> {
  return action(db, async (w) => {
    const items = await waitingItems(w, ids);
    const tag = await tagNamed(w, name);
    const links: TagLink[] = [];
    for (const item of items) {
      const link = await ensureTag(w, { kind: 'inboxItem', id: item.id }, tag.id);
      if (link) links.push(link);
    }
    return { tag, links };
  });
}

/** Undo for `tagInboxItems`: the links it made are gone again. */
export function untagInboxItems(links: readonly TagLink[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const link of links) await w.remove(link.entity, link.id);
  });
}

/** An item's snooze before a change, for Undo. */
export interface Snooze {
  id: string;
  snoozedUntil: string | null;
}

/**
 * "Process later" (F27, M11-04): the items hide until `until` on every device; null wakes them
 * now. Returns their snoozes before, for Undo (`restoreSnoozes`).
 */
export function snoozeInboxItems(
  ids: readonly string[],
  until: string | null,
  db: LampDb = appDb,
): Promise<Snooze[]> {
  return action(db, async (w) => {
    const before: Snooze[] = [];
    for (const item of await waitingItems(w, ids)) {
      before.push({ id: item.id, snoozedUntil: item.snoozedUntil });
      await w.update('inboxItem', item.id, { snoozedUntil: until });
    }
    return before;
  });
}

export function restoreSnoozes(before: readonly Snooze[], db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    for (const { id, snoozedUntil } of before) {
      const item = await w.db.inboxItem.get(id);
      if (item?.deletedAt === null) await w.update('inboxItem', id, { snoozedUntil });
    }
  });
}

/** Snoozed past `day`: live, not placed, hidden until a later day. */
const isSnoozed = (item: InboxItem, day: string): boolean =>
  item.deletedAt === null &&
  item.placedInSectionId === null &&
  item.snoozedUntil !== null &&
  item.snoozedUntil > day;

/** The items snoozed past `day`, the soonest to come back first. */
export async function snoozedItems(day: string, db: LampDb = appDb): Promise<InboxItem[]> {
  const items = await db.inboxItem.filter((item) => isSnoozed(item, day)).toArray();
  return items.toSorted(
    (a, b) =>
      a.snoozedUntil!.localeCompare(b.snoozedUntil!) ||
      b.receivedAt.localeCompare(a.receivedAt) ||
      b.id.localeCompare(a.id),
  );
}

/** How many items are snoozed past `day`: the "Snoozed · 4" row. */
export function snoozedCount(day: string, db: LampDb = appDb): Promise<number> {
  return db.inboxItem.filter((item) => isSnoozed(item, day)).count();
}

/** The tags on each of the items, in the order they were added. */
export async function inboxItemTags(
  ids: readonly string[],
  db: LampDb = appDb,
): Promise<Map<string, Tag[]>> {
  const wanted = new Set(ids);
  const links = (
    await db.inboxItemTag
      .filter((link) => link.deletedAt === null && wanted.has(link.inboxItemId))
      .toArray()
  ).toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  const tags = new Map(
    (await db.tag.bulkGet([...new Set(links.map((link) => link.tagId))]))
      .filter((tag): tag is Tag => tag?.deletedAt === null)
      .map((tag) => [tag.id, tag]),
  );
  const byItem = new Map<string, Tag[]>();
  for (const link of links) {
    const tag = tags.get(link.tagId);
    if (!tag) continue;
    byItem.set(link.inboxItemId, [...(byItem.get(link.inboxItemId) ?? []), tag]);
  }
  return byItem;
}

/**
 * The waiting items among `ids`, in the order they were received; one that's gone (placed or
 * dismissed on another device meanwhile) is left out. None at all is an error.
 */
async function waitingItems(w: Writer, ids: readonly string[]): Promise<InboxItem[]> {
  const rows = await w.db.inboxItem.bulkGet([...ids]);
  const items = rows.filter(
    (item): item is InboxItem => item?.deletedAt === null && item.placedInSectionId === null,
  );
  if (items.length === 0) throw new RowNotFoundError('inboxItem', ids.join(', '));
  return items.toSorted(
    (a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.id.localeCompare(b.id),
  );
}

async function liveLesson(w: Writer, id: string): Promise<Lesson> {
  const lesson = await w.db.lesson.get(id);
  if (!lesson || lesson.deletedAt !== null) throw new RowNotFoundError('lesson', id);
  return lesson;
}
