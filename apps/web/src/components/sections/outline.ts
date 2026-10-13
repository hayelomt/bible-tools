import { compareOrder, keyBetween } from '@lamp/domain';

/**
 * A lesson's sections as the editor shows them (F2, wireframes/lessons.md): top-level sections in
 * order, each followed by its replies. The UI allows two levels, so these helpers never place a
 * section under a reply. Pure functions over the stored sections and the editor's drafts.
 */

export interface OutlineItem {
  id: string;
  parentId: string | null;
  orderKey: string;
}

/** Where a section sits: under which parent, and its key among that parent's children. */
export type Placement = Pick<OutlineItem, 'parentId' | 'orderKey'>;

export interface OutlineRow<T extends OutlineItem = OutlineItem> {
  item: T;
  /** 0 for a section, 1 for a reply. */
  level: 0 | 1;
  /** The section a reply is shown under; null at the top level. */
  parent: string | null;
  /** How many replies a section has; 0 for a reply. */
  replies: number;
}

/**
 * Sections in reading order. A reply whose parent is missing, or is itself a reply (only possible
 * through sync), is shown at the top level, so nothing is hidden.
 */
export function outline<T extends OutlineItem>(items: readonly T[]): OutlineRow<T>[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const isTop = (i: T) => i.parentId === null || !byId.has(i.parentId);
  const shownParent = (i: T) => (!isTop(i) && isTop(byId.get(i.parentId!)!) ? i.parentId : null);

  const replies = new Map<string, T[]>();
  for (const item of items) {
    const parent = shownParent(item);
    if (parent) replies.set(parent, [...(replies.get(parent) ?? []), item]);
  }
  const rows: OutlineRow<T>[] = [];
  for (const item of items.filter((i) => shownParent(i) === null).toSorted(compareOrder)) {
    const own = (replies.get(item.id) ?? []).toSorted(compareOrder);
    rows.push({ item, level: 0, parent: null, replies: own.length });
    for (const reply of own) rows.push({ item: reply, level: 1, parent: item.id, replies: 0 });
  }
  return rows;
}

/** The siblings of a row (itself included), in order. */
function siblings(rows: readonly OutlineRow[], parent: string | null): OutlineRow[] {
  return rows.filter((r) => r.parent === parent);
}

/**
 * A key right after `index` among `keys`. Two devices can give siblings the same key (ties sort by
 * id), so the next key strictly greater is the upper bound.
 */
function keyAfter(keys: readonly string[], index: number): string {
  const before = keys[index]!;
  const after = keys.slice(index + 1).find((k) => k > before) ?? null;
  return keyBetween(before, after);
}

function lastKey(rows: readonly OutlineRow[]): string | null {
  return rows.at(-1)?.item.orderKey ?? null;
}

/** A new section at the end of the lesson ("+ Section"). */
export function endPlacement(rows: readonly OutlineRow[]): Placement {
  return { parentId: null, orderKey: keyBetween(lastKey(siblings(rows, null)), null) };
}

/** A new section right after `id`, at the same level (Enter at the end of a section). */
export function afterPlacement(rows: readonly OutlineRow[], id: string): Placement {
  const row = rows.find((r) => r.item.id === id);
  if (!row) return endPlacement(rows);
  const keys = siblings(rows, row.parent).map((r) => r.item.orderKey);
  const index = siblings(rows, row.parent).indexOf(row);
  return { parentId: row.parent, orderKey: keyAfter(keys, index) };
}

/** A new reply to `id`: its last reply, or the next reply after `id` when `id` is a reply. */
export function replyPlacement(rows: readonly OutlineRow[], id: string): Placement {
  const row = rows.find((r) => r.item.id === id);
  if (!row || row.level === 1) return afterPlacement(rows, id);
  return { parentId: id, orderKey: keyBetween(lastKey(siblings(rows, id)), null) };
}

/**
 * Makes `id` a reply to the section above it (Tab), as its last reply, so it stays where it is on
 * screen. Null when that would make a third level or there's no section above: a reply, a section
 * with replies, or the first section.
 */
export function indentPlacement(rows: readonly OutlineRow[], id: string): Placement | null {
  const row = rows.find((r) => r.item.id === id);
  if (!row || row.level === 1 || row.replies > 0) return null;
  const top = siblings(rows, null);
  const above = top[top.indexOf(row) - 1];
  if (!above) return null;
  return {
    parentId: above.item.id,
    orderKey: keyBetween(lastKey(siblings(rows, above.item.id)), null),
  };
}

/**
 * Moves a reply out to the top level (Shift+Tab), right after its section. Null for a section
 * that's already at the top level.
 */
export function outdentPlacement(rows: readonly OutlineRow[], id: string): Placement | null {
  const row = rows.find((r) => r.item.id === id);
  if (!row || row.level === 0 || row.parent === null) return null;
  return afterPlacement(rows, row.parent);
}
