import {
  ENTITY_NAMES,
  type EntityName,
  MIN_CLIENT_VERSION,
  type PulledRow,
  type PullQuery,
  type PullResponse,
} from '@lamp/domain';
import { Injectable } from '@nestjs/common';
import { Prisma, type User } from '../generated/prisma/client.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { PrismaService } from '../prisma/prisma.service.js';
import { ENTITY_TABLES, type RowModel, toRow, type Tx } from './entity-tables.js';
import { assertVerified } from './sync-access.js';

/** A stored row of any entity, with the rev it was last written at. */
interface Found {
  entity: EntityName;
  rev: bigint;
  stored: { id?: string; rev: bigint };
}

type TableQuery = Parameters<RowModel['findMany']>[0];

/**
 * Within one rev, parents before children (`ENTITY_NAMES` lists them in that order), so a device
 * applying a page in order never holds a row whose parent comes later.
 */
const ENTITY_ORDER = new Map(ENTITY_NAMES.map((name, i) => [name, i]));

const byRev = (a: Found, b: Found): number =>
  a.rev === b.rev
    ? (ENTITY_ORDER.get(a.entity) ?? 0) - (ENTITY_ORDER.get(b.entity) ?? 0) ||
      (a.stored.id ?? '').localeCompare(b.stored.id ?? '')
    : a.rev < b.rev
      ? -1
      : 1;

@Injectable()
export class PullService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The account's rows written after `cursor`, tombstones included, oldest rev first (§6.3).
   *
   * Every read is in one repeatable-read transaction, so the page comes from one snapshot. A push
   * takes the user's row lock before its rev and holds it until it commits, so one account's revs
   * commit in order, and a snapshot holds every rev up to its newest: the cursor can't pass a rev
   * that commits later. Separate reads per table would each see a different moment.
   */
  async pull(user: User, { cursor, limit }: PullQuery): Promise<PullResponse> {
    assertVerified(user);
    const serverTime = new Date().toISOString();
    const { rows, hasMore, remaining } = await this.prisma.$transaction(
      async (tx) => ({
        ...(await this.page(tx, user.id, BigInt(cursor), limit)),
        remaining: await this.count(tx, user.id, BigInt(cursor)),
      }),
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    const last = rows.at(-1);
    return {
      rows: rows.map(pulled),
      nextCursor: last ? Number(last.rev) : cursor,
      hasMore,
      remaining,
      serverTime,
      minClientVersion: MIN_CLIENT_VERSION,
    };
  }

  /**
   * Up to `limit` rows after `cursor`, never ending partway through a rev: a conflicted copy or a
   * restored parent shares its change's rev, and a cursor at that rev would skip the rest of it.
   * So a page that would split a rev ends before it, or, if that rev alone is more than `limit`
   * rows, holds the whole rev.
   */
  private async page(
    tx: Tx,
    userId: string,
    cursor: bigint,
    limit: number,
  ): Promise<{ rows: Found[]; hasMore: boolean }> {
    // The first `limit + 1` rows overall are among the first `limit + 1` of their own table.
    const found = (await this.find(tx, userId, { gt: cursor }, limit + 1)).toSorted(byRev);
    const next = found[limit];
    if (!next) return { rows: found, hasMore: false };
    const before = found.slice(0, limit).filter((row) => row.rev < next.rev);
    if (before.length > 0) return { rows: before, hasMore: true };
    return { rows: (await this.find(tx, userId, next.rev)).toSorted(byRev), hasMore: true };
  }

  /** Rows of every entity after a rev (`{ gt }`) or at one; `take` caps each table, not the total. */
  private async find(
    tx: Tx,
    userId: string,
    rev: { gt: bigint } | bigint,
    take?: number,
  ): Promise<Found[]> {
    const query = { where: { userId, rev }, orderBy: { rev: 'asc' as const }, take };
    const found: Found[] = [];
    for (const entity of ENTITY_NAMES) {
      for (const stored of await this.read(tx, entity, query)) {
        found.push({ entity, rev: stored.rev, stored });
      }
    }
    return found;
  }

  /**
   * How many rows are after `cursor`, this page's included, from the same snapshot: the total a
   * device's first-sync progress counts towards (§6.3).
   */
  private async count(tx: Tx, userId: string, cursor: bigint): Promise<number> {
    const where = { userId, rev: { gt: cursor } };
    let total = 0;
    for (const entity of ENTITY_NAMES) {
      total +=
        entity === 'userSettings'
          ? await tx.userSettings.count({ where })
          : await ENTITY_TABLES[entity].model(tx).count({ where });
    }
    return total;
  }

  /** One table's rows. */
  private read(tx: Tx, entity: EntityName, query: TableQuery): Promise<Found['stored'][]> {
    return entity === 'userSettings'
      ? tx.userSettings.findMany(query)
      : ENTITY_TABLES[entity].model(tx).findMany(query);
  }
}

/** A stored row as the device stores it, `rev` and all. */
function pulled({ entity, rev, stored }: Found): PulledRow {
  return { entity, row: { ...toRow(stored), rev: Number(rev) } } as PulledRow;
}
