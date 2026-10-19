import {
  GROUP_ENTITIES,
  type GroupEntity,
  type GroupPulledRow,
  type GroupPullQuery,
  type GroupPullResponse,
} from '@lamp/domain';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApiException, ErrorCode } from '../common/errors.js';
import { Prisma, type User } from '../generated/prisma/client.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { PrismaService } from '../prisma/prisma.service.js';
import { toRow } from '../sync/entity-tables.js';
import { assertSupportedClient, assertVerified } from '../sync/sync-access.js';

type Tx = Prisma.TransactionClient;

interface Entry {
  entity: GroupEntity;
  entityId: string;
  rev: bigint;
  gone: boolean;
}

/** A feed row as stored: its entity is one of `GROUP_ENTITIES` (a check constraint). */
const entries = (rows: { entity: string; entityId: string; rev: bigint; gone: boolean }[]) =>
  rows as Entry[];

const ORDER = new Map(GROUP_ENTITIES.map((entity, i) => [entity, i]));

const byRev = (a: Entry, b: Entry): number =>
  a.rev === b.rev
    ? (ORDER.get(a.entity) ?? 0) - (ORDER.get(b.entity) ?? 0) ||
      a.entityId.localeCompare(b.entityId)
    : a.rev < b.rev
      ? -1
      : 1;

/**
 * A group's feed (F35, §17.12): what changed for its members after a cursor, as projections, from
 * one snapshot. Each row is read from its table and checked again against the group's rules, so a
 * row the feed should have dropped goes out as gone: a mistake can hide a row, never show one.
 */
@Injectable()
export class GroupPullService {
  constructor(private readonly prisma: PrismaService) {}

  async pull(user: User, groupId: string, query: GroupPullQuery): Promise<GroupPullResponse> {
    assertSupportedClient(query.clientVersion);
    assertVerified(user);
    const cursor = BigInt(query.cursor);
    return this.prisma.$transaction(
      async (tx) => {
        const member = await tx.groupMember.findUnique({
          where: { groupId_userId: { groupId, userId: user.id } },
        });
        if (!member)
          throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'No such group');
        // From the start, what's gone has nothing to remove.
        const where = {
          groupId,
          rev: { gt: cursor },
          ...(cursor === 0n ? { gone: false } : {}),
        };
        const found = entries(
          await tx.groupFeed.findMany({ where, orderBy: { rev: 'asc' }, take: query.limit + 1 }),
        ).toSorted(byRev);
        const { entries: pageEntries, hasMore } = await page(
          tx,
          groupId,
          found,
          query.limit,
          cursor === 0n,
        );
        const rows = await rowsOf(tx, groupId, pageEntries);
        const visible = cursor === 0n ? rows.filter((row) => !('gone' in row)) : rows;
        return {
          rows: visible,
          nextCursor: pageEntries.length > 0 ? Number(pageEntries.at(-1)!.rev) : query.cursor,
          hasMore,
          remaining: await tx.groupFeed.count({ where }),
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
  }
}

/** Up to `limit` entries, never ending partway through a rev (as the user pull, §6.3). */
async function page(
  tx: Tx,
  groupId: string,
  found: Entry[],
  limit: number,
  fromStart: boolean,
): Promise<{ entries: Entry[]; hasMore: boolean }> {
  const next = found[limit];
  if (!next) return { entries: found, hasMore: false };
  const before = found.slice(0, limit).filter((entry) => entry.rev < next.rev);
  if (before.length > 0) return { entries: before, hasMore: true };
  const whole = await tx.groupFeed.findMany({
    where: { groupId, rev: next.rev, ...(fromStart ? { gone: false } : {}) },
  });
  return { entries: entries(whole).toSorted(byRev), hasMore: true };
}

/** Each entry as its projection, if the group may still see it, or as gone. */
async function rowsOf(tx: Tx, groupId: string, wanted: Entry[]): Promise<GroupPulledRow[]> {
  const ids = (entity: GroupEntity) =>
    wanted.filter((e) => e.entity === entity && !e.gone).map((e) => e.entityId);
  const [group, members, shared, lessons] = await Promise.all([
    tx.group.findUnique({ where: { id: groupId } }),
    tx.groupMember.findMany({ where: { groupId, id: { in: ids('member') } } }),
    tx.groupSeries.findMany({ where: { groupId }, include: { series: true } }),
    tx.lesson.findMany({ where: { id: { in: ids('lesson') }, deletedAt: null } }),
  ]);
  const series = new Map(
    shared.filter((s) => s.series.deletedAt === null).map((s) => [s.seriesId, s.series]),
  );
  const rows = new Map<string, GroupPulledRow>();
  if (group) {
    rows.set(`group:${group.id}`, {
      entity: 'group',
      row: { id: group.id, name: group.name, createdAt: group.createdAt.toISOString() },
    });
  }
  for (const m of members) {
    rows.set(`member:${m.id}`, {
      entity: 'member',
      row: {
        id: m.id,
        userId: m.userId,
        displayName: m.displayName,
        role: m.role as 'owner' | 'member',
        joinedAt: m.joinedAt.toISOString(),
      },
    });
  }
  for (const s of series.values()) {
    rows.set(`series:${s.id}`, {
      entity: 'series',
      row: {
        id: s.id,
        userId: s.userId,
        title: s.title,
        description: s.description,
        kind: s.kind as 'custom',
      },
    });
  }
  for (const stored of lessons) {
    if (!stored.seriesId || !series.has(stored.seriesId)) continue;
    const lesson = toRow('lesson', stored);
    rows.set(`lesson:${stored.id}`, {
      entity: 'lesson',
      row: {
        id: lesson.id,
        userId: stored.userId,
        seriesId: lesson.seriesId,
        title: lesson.title,
        date: lesson.date,
        kind: lesson.kind,
        speaker: lesson.speaker,
        church: lesson.church,
        mainPassages: lesson.mainPassages,
        sourceType: lesson.sourceType,
        sourceTitle: lesson.sourceTitle,
        sourceAuthor: lesson.sourceAuthor,
        sourceUrl: lesson.sourceUrl,
        sourceStartedAt: lesson.sourceStartedAt,
        createdAt: lesson.createdAt,
        updatedAt: lesson.updatedAt,
      },
    });
  }
  return wanted.map(
    ({ entity, entityId }) =>
      rows.get(`${entity}:${entityId}`) ?? { entity, id: entityId, gone: true as const },
  );
}
