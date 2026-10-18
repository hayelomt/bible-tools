import type { EntityName, EntityRow, SyncRow } from '@lamp/domain';
import { Prisma } from '../generated/prisma/client.js';

export type Tx = Prisma.TransactionClient;

/** The entities stored one row per id; settings are one row per account instead. */
export type RowEntity = Exclude<EntityName, 'userSettings'>;

/** A stored row as the push reads it: the sync columns, and whatever else the model has. */
export interface StoredRow {
  id: string;
  userId: string;
  rev: bigint;
  deletedAt: Date | null;
  [column: string]: unknown;
}

/** The part of a Prisma model delegate the push uses, the same for every row entity. */
export interface RowModel {
  findUnique(args: { where: { id: string } }): Promise<StoredRow | null>;
  findMany(args: {
    where: { userId: string; rev: { gt: bigint } | bigint };
    orderBy?: { rev: 'asc' };
    take?: number;
  }): Promise<StoredRow[]>;
  count(args: { where: { userId: string; rev: { gt: bigint } } }): Promise<number>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

interface EntityTable {
  model: (tx: Tx) => RowModel;
  /** Columns that hold another row's id, and that row's entity. */
  refs: Readonly<Record<string, RowEntity>>;
  /** Columns sent as ISO strings and stored as timestamps or dates. */
  times: readonly string[];
  /** Nullable `jsonb` columns, whose `null` Prisma writes only as `DbNull`. */
  nullableJson?: readonly string[];
  /**
   * Columns that left the wire format and stay, unwritten, for one release so a rollback still
   * works (§6.7 step 5): never sent, and kept as stored by a push.
   */
  retired?: readonly string[];
}

const SYNC_TIMES = ['createdAt', 'updatedAt', 'deletedAt'];

// Prisma's delegates have generic signatures that don't narrow to `RowModel`, so they are asserted.
const model = (pick: (tx: Tx) => unknown) => pick as (tx: Tx) => RowModel;

export const ENTITY_TABLES: Readonly<Record<RowEntity, EntityTable>> = {
  series: { model: model((tx) => tx.series), refs: {}, times: SYNC_TIMES },
  lesson: {
    model: model((tx) => tx.lesson),
    refs: { seriesId: 'series' },
    times: [...SYNC_TIMES, 'date'],
    // Its `kind` since M10 (§17.7); the next release drops it.
    retired: ['source'],
  },
  section: {
    model: model((tx) => tx.section),
    refs: { lessonId: 'lesson', parentId: 'section', conflictOf: 'section' },
    times: SYNC_TIMES,
  },
  tag: { model: model((tx) => tx.tag), refs: {}, times: SYNC_TIMES },
  sectionTag: {
    model: model((tx) => tx.sectionTag),
    refs: { tagId: 'tag', sectionId: 'section' },
    times: SYNC_TIMES,
  },
  lessonTag: {
    model: model((tx) => tx.lessonTag),
    refs: { tagId: 'tag', lessonId: 'lesson' },
    times: SYNC_TIMES,
  },
  takeaway: { model: model((tx) => tx.takeaway), refs: { lessonId: 'lesson' }, times: SYNC_TIMES },
  question: {
    model: model((tx) => tx.question),
    refs: { lessonId: 'lesson', splitFromId: 'question' },
    times: SYNC_TIMES,
    // Its entries hold these since M10 (§17.5); the next release drops them.
    retired: ['status', 'answerSectionId'],
  },
  highlight: {
    model: model((tx) => tx.highlight),
    refs: { promotedSectionId: 'section' },
    times: SYNC_TIMES,
  },
  memoryItem: {
    model: model((tx) => tx.memoryItem),
    refs: {},
    times: [...SYNC_TIMES, 'nextReviewAt'],
  },
  inboxItem: {
    model: model((tx) => tx.inboxItem),
    refs: { placedInSectionId: 'section' },
    times: [...SYNC_TIMES, 'receivedAt', 'snoozedUntil'],
    nullableJson: ['ref'],
  },
  questionEntry: {
    model: model((tx) => tx.questionEntry),
    refs: { questionId: 'question', lessonId: 'lesson', sectionId: 'section' },
    times: SYNC_TIMES,
  },
  template: { model: model((tx) => tx.template), refs: {}, times: SYNC_TIMES },
};

/** Columns stored as a `date`, which the device has as `YYYY-MM-DD`. */
const DATE_COLUMNS = new Set(['date', 'snoozedUntil']);

/** Columns that never leave the server; `rev` travels beside the row. */
const SERVER_COLUMNS = new Set(['userId', 'rev', 'bodyRev', 'bodyDevice']);

/**
 * A stored row as the device has it, without `rev`: times become ISO strings, a date `YYYY-MM-DD`,
 * and retired columns are left out.
 */
export function toRow<E extends EntityName>(entity: E, stored: object): SyncRow<E> {
  const retired =
    entity === 'userSettings' ? [] : (ENTITY_TABLES[entity as RowEntity].retired ?? []);
  const row: Record<string, unknown> = {};
  for (const [column, value] of Object.entries(stored)) {
    if (SERVER_COLUMNS.has(column) || retired.includes(column)) continue;
    if (!(value instanceof Date)) row[column] = value;
    else {
      row[column] = DATE_COLUMNS.has(column)
        ? value.toISOString().slice(0, 10)
        : value.toISOString();
    }
  }
  return row as SyncRow<E>;
}

/** A pushed row (no `rev`) as Prisma column values: times become `Date`s. */
export function toColumns(
  entity: RowEntity,
  row: Omit<EntityRow<RowEntity>, 'rev'>,
): Record<string, unknown> {
  const columns: Record<string, unknown> = { ...row };
  const { times, nullableJson = [] } = ENTITY_TABLES[entity];
  for (const time of times) {
    const value = columns[time] as string | null;
    columns[time] = value === null ? null : new Date(value);
  }
  for (const column of nullableJson) {
    if (columns[column] === null) columns[column] = Prisma.DbNull;
  }
  return columns;
}
