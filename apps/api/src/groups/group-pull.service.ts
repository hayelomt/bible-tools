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
import { type FeedRef, feedKey, visibility } from './feed.js';

type Tx = Prisma.TransactionClient;

interface Entry {
  entity: GroupEntity;
  entityId: string;
  rev: bigint;
  gone: boolean;
  addedRev: bigint;
}

/** A feed row as stored: its entity is one of `GROUP_ENTITIES` (a check constraint). */
const entries = (rows: (Omit<Entry, 'entity'> & { entity: string })[]) => rows as Entry[];

type WithoutRev<T> = T extends unknown ? Omit<T, 'addedRev'> : never;
/** A row's projection, before the feed's `addedRev` is put beside it. */
type Projection = WithoutRev<Extract<GroupPulledRow, { addedRev: number }>>;

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
        // The last page ends at the group's rev, past any rev that changed nothing here (an
        // invite made again), so the device doesn't ask again.
        const group = await tx.group.findUnique({ where: { id: groupId } });
        const last = pageEntries.at(-1)?.rev ?? cursor;
        const end = !hasMore && group && group.syncRev > last ? group.syncRev : last;
        return {
          rows: visible,
          nextCursor: Number(end),
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
  const asked = wanted
    .filter((e) => !e.gone)
    .map((e): FeedRef => ({ entity: e.entity, id: e.entityId }));
  const { visible, threads } = await visibility(tx, groupId, asked);
  const ids = (entity: GroupEntity) =>
    asked.filter((r) => r.entity === entity && visible.has(feedKey(entity, r.id))).map((r) => r.id);
  const group = visible.has(feedKey('group', groupId))
    ? await tx.group.findUnique({ where: { id: groupId } })
    : null;
  const members = await tx.groupMember.findMany({ where: { id: { in: ids('member') } } });
  const series = await tx.series.findMany({ where: { id: { in: ids('series') } } });
  const lessons = await tx.lesson.findMany({ where: { id: { in: ids('lesson') } } });
  const sections = await tx.section.findMany({ where: { id: { in: ids('section') } } });
  const questions = await tx.question.findMany({ where: { id: { in: ids('question') } } });
  const comments = await tx.comment.findMany({ where: { id: { in: ids('comment') } } });

  const rows = new Map<string, Projection>();
  if (group) {
    rows.set(feedKey('group', group.id), {
      entity: 'group',
      row: { id: group.id, name: group.name, createdAt: group.createdAt.toISOString() },
    });
  }
  for (const m of members) {
    rows.set(feedKey('member', m.id), {
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
  for (const stored of series) {
    const s = toRow('series', stored);
    rows.set(feedKey('series', s.id), {
      entity: 'series',
      row: {
        id: s.id,
        userId: stored.userId,
        title: s.title,
        description: s.description,
        kind: s.kind,
      },
    });
  }
  for (const stored of lessons) {
    const lesson = toRow('lesson', stored);
    rows.set(feedKey('lesson', stored.id), {
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
  for (const stored of sections) {
    const section = toRow('section', stored);
    rows.set(feedKey('section', stored.id), {
      entity: 'section',
      row: {
        id: section.id,
        userId: stored.userId,
        groupLessonId: threads.get(feedKey('section', stored.id))!,
        parentId: section.parentId,
        replyToId: section.replyToId,
        sharedAt: section.sharedAt,
        body: section.body,
        sourceAt: section.sourceAt,
        sourcePage: section.sourcePage,
        answersQuestionId: section.answersQuestionId,
        answerKind: section.answerKind,
        createdAt: section.createdAt,
        updatedAt: section.updatedAt,
      },
    });
  }
  for (const stored of questions) {
    const question = toRow('question', stored);
    rows.set(feedKey('question', stored.id), {
      entity: 'question',
      row: {
        id: question.id,
        userId: stored.userId,
        groupLessonId: threads.get(feedKey('question', stored.id))!,
        text: question.text,
        createdAt: question.createdAt,
        updatedAt: question.updatedAt,
      },
    });
  }
  for (const stored of comments) {
    const comment = toRow('comment', stored);
    rows.set(feedKey('comment', stored.id), {
      entity: 'comment',
      row: {
        id: comment.id,
        userId: stored.userId,
        sectionId: comment.sectionId,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
      },
    });
  }
  return wanted.map(({ entity, entityId, addedRev }): GroupPulledRow => {
    const projection = rows.get(feedKey(entity, entityId));
    return projection
      ? { ...projection, addedRev: Number(addedRev) }
      : { entity, id: entityId, gone: true };
  });
}
