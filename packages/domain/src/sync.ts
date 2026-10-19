import type { SectionBody } from './doc.ts';
import type { EntityName, EntityRow, Section } from './schemas/entities.ts';
import type { ConflictResolution } from './schemas/sync.ts';

/**
 * The conflict rules (TECH-DESIGN §6.4) as pure functions: the server reads the stored row, asks
 * these what to store, and writes it. Rows are as sent, without `rev`.
 */

/** A pushed or stored row without `rev`. Settings have no tombstone. */
export type SyncRow<E extends EntityName = EntityName> = Omit<EntityRow<E>, 'rev'>;

interface Row {
  updatedAt: string;
  deletedAt?: string | null;
  body?: unknown;
}

export interface Outcome<R> {
  /** The row to store, with the next revision. */
  row: R;
  /** Null when `baseRev` was current, so there was no conflict. */
  resolution: ConflictResolution | null;
  /**
   * A section body that lost to a newer one, saved as a conflicted copy, and whether it was the
   * stored body or the one this device sent.
   */
  copy?: { body: SectionBody; time: string; from: 'server' | 'device' };
  /** Whether anything this device sent was kept, so the rows it sits under must be live. */
  keepsClientEdit: boolean;
}

export interface UpsertInput<R extends Row> {
  /** The stored row, or null if the server has none. */
  server: R | null;
  serverRev: number;
  baseRev: number;
  incoming: R;
  /** The fields this device edited since `baseRev`; undefined means all of them. */
  changed?: readonly string[];
  /** For sections: whether the stored body changed after `baseRev`. */
  serverBodyChanged?: boolean;
}

/**
 * An upsert. With a current `baseRev` the edited fields are written. Otherwise both sides changed
 * the row: an edit beats a delete; a body edited on both sides keeps the newer one and saves the
 * older as a copy; anything else is last write wins by `updatedAt`, ties to the server. Fields this
 * device didn't edit always keep the stored values.
 */
export function resolveUpsert<R extends Row>(input: UpsertInput<R>): Outcome<R> {
  const { server, incoming } = input;
  if (!server) return { row: incoming, resolution: null, keepsClientEdit: true };
  const merged = { ...server, ...pick(incoming, input.changed), updatedAt: incoming.updatedAt };
  if (input.baseRev === input.serverRev) {
    return { row: merged, resolution: null, keepsClientEdit: true };
  }
  if (isDeleted(server) && !isDeleted(incoming)) {
    return { row: { ...merged, deletedAt: null }, resolution: 'edit-won', keepsClientEdit: true };
  }

  const clientWins = Date.parse(incoming.updatedAt) > Date.parse(server.updatedAt);
  const bodyEdited =
    'body' in incoming &&
    (input.changed?.includes('body') ?? true) &&
    !sameJson(incoming.body, server.body);
  if (bodyEdited && input.serverBodyChanged) {
    const [row, loser] = clientWins ? [merged, server] : [server, incoming];
    return {
      row,
      resolution: 'conflicted-copy',
      copy: {
        body: loser.body as SectionBody,
        time: loser.updatedAt,
        from: clientWins ? 'server' : 'device',
      },
      keepsClientEdit: true,
    };
  }
  if (clientWins) return { row: merged, resolution: 'client-won', keepsClientEdit: true };
  if (bodyEdited) {
    // Only this device edited the body, so it isn't part of what the server's later write won.
    return {
      row: { ...server, body: incoming.body },
      resolution: 'server-won',
      keepsClientEdit: true,
    };
  }
  return { row: server, resolution: 'server-won', keepsClientEdit: false };
}

export interface DeleteInput<R extends Row> {
  server: R;
  serverRev: number;
  baseRev: number;
  /** The change's `clientTime`. */
  time: string;
}

/** A delete. A row changed since `baseRev` keeps the change (edit wins); a deleted one stays so. */
export function resolveDelete<R extends Row>(input: DeleteInput<R>): Outcome<R> {
  const { server, time } = input;
  if (input.baseRev === input.serverRev) {
    const row = { ...server, deletedAt: server.deletedAt ?? time, updatedAt: time };
    return { row, resolution: null, keepsClientEdit: false };
  }
  return {
    row: server,
    resolution: isDeleted(server) ? 'already-deleted' : 'edit-won',
    keepsClientEdit: false,
  };
}

/**
 * The columns naming the row a row sits under. When an edit is kept, a deleted parent is restored
 * so the edit isn't left orphaned (§6.4).
 */
export const PARENT_COLUMNS: Readonly<Record<EntityName, readonly string[]>> = {
  userSettings: [],
  series: [],
  lesson: ['seriesId'],
  section: ['lessonId', 'parentId'],
  tag: [],
  sectionTag: ['tagId', 'sectionId'],
  lessonTag: ['tagId', 'lessonId'],
  takeaway: ['lessonId'],
  question: ['lessonId'],
  highlight: [],
  memoryItem: [],
  // The section an item was placed in isn't its parent: the item is done with once placed.
  inboxItem: [],
  inboxItemTag: ['tagId', 'inboxItemId'],
  // An edit kept on an entry brings back the question it's in, and the lesson it happened in.
  questionEntry: ['questionId', 'lessonId'],
  template: [],
  passageVisit: [],
  resurfaceDismissal: [],
  // Its section may be another member's, which no push of the author's restores.
  comment: [],
};

/**
 * The conflicted copy of `section`: a new sibling right after it (`orderKey` between it and the
 * next sibling) holding the losing body, dated when that body was written and labelled with the
 * device that wrote it.
 */
export function conflictedCopy(
  section: SyncRow<'section'>,
  copy: { body: SectionBody; time: string; device: string | null },
  id: string,
  orderKey: string,
): SyncRow<'section'> {
  return {
    id,
    lessonId: section.lessonId,
    parentId: section.parentId,
    orderKey,
    body: copy.body,
    conflictOf: section.id,
    conflictDevice: copy.device,
    // The same moment in the source as the section it was copied from.
    sourceAt: section.sourceAt,
    sourcePage: section.sourcePage,
    // In the same thread, next to it; one answer to a question is enough.
    visibility: section.visibility,
    groupId: section.groupId,
    sharedAt: section.sharedAt,
    replyToId: section.replyToId,
    answersQuestionId: null,
    answerKind: null,
    createdAt: copy.time,
    updatedAt: copy.time,
    deletedAt: null,
  } satisfies Omit<Section, 'rev'>;
}

/** Deep equality of JSON values, ignoring key order (Postgres `jsonb` reorders keys). */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every(
    (key) =>
      Object.hasOwn(b, key) &&
      sameJson((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

const isDeleted = (row: Row) => (row.deletedAt ?? null) !== null;

function pick<R extends object>(row: R, fields: readonly string[] | undefined): Partial<R> {
  if (!fields) return row;
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => fields.includes(key)),
  ) as Partial<R>;
}
