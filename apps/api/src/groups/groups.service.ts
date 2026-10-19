import {
  type CreateGroupRequest,
  type InvitePreview,
  MAX_GROUP_MEMBERS,
  newId,
} from '@lamp/domain';
import { HttpStatus, Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import { hashToken } from '../auth/tokens.js';
import { ApiException, ErrorCode } from '../common/errors.js';
import type { Env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { nextGroupRev, settleGroup, writeFeed } from './feed.js';
import { inviteToken } from './invite-token.js';

type Tx = Prisma.TransactionClient;

export const GroupErrorCode = {
  /** The series is already in a group (one group per series, decision 100). */
  IN_GROUP: 'IN_GROUP',
  GROUP_FULL: 'GROUP_FULL',
  ALREADY_MEMBER: 'ALREADY_MEMBER',
  /** The owner leaves only once someone else is owner, or as the last member. */
  OWNER_MUST_HAND_OVER: 'OWNER_MUST_HAND_OVER',
  /** Only the group's owner can do that. */
  NOT_GROUP_OWNER: 'NOT_GROUP_OWNER',
} as const;

const notFound = (message = 'No such group') =>
  new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);

/**
 * Groups, their members and their series (F35, M13-07, §17.12), changed online only, each in one
 * transaction that takes the group's next feed revision. Users' rows are locked before the
 * group's, as a push does, so the two can't deadlock. Someone outside a group gets `404` for it,
 * as for a group that doesn't exist.
 */
@Injectable()
export class GroupsService {
  private readonly secret: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('SHARE_LINK_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /** A group around one of the caller's live series, with the caller as its owner. */
  async create(userId: string, request: CreateGroupRequest): Promise<string> {
    const id = newId();
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockUsers(tx, [userId]);
        const series = await tx.series.findFirst({
          where: { id: request.seriesId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!series) throw notFound('No such series');
        await tx.group.create({
          data: {
            id,
            name: request.name,
            inviteTokenHash: hashToken(inviteToken(this.secret, id, 1)),
          },
        });
        const rev = (await nextGroupRev(tx, id))!;
        const member = await tx.groupMember.create({
          data: { groupId: id, userId, role: 'owner', displayName: request.displayName },
        });
        await tx.groupSeries.create({ data: { groupId: id, seriesId: series.id } });
        await settleGroup(tx, id, rev, [
          { entity: 'group', id },
          { entity: 'member', id: member.id },
          { entity: 'series', id: series.id },
        ]);
      });
    } catch (error) {
      throw inGroup(error);
    }
    return id;
  }

  async rename(userId: string, groupId: string, name: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rev = await this.asOwner(tx, userId, groupId);
      await tx.group.update({ where: { id: groupId }, data: { name } });
      await writeFeed(tx, groupId, rev, [{ entity: 'group', entityId: groupId, gone: false }]);
    });
  }

  /** The invite's address, for the owner to copy again. */
  async invite(userId: string, groupId: string): Promise<string> {
    const member = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
      include: { group: { select: { inviteVersion: true } } },
    });
    if (!member) throw notFound();
    if (member.role !== 'owner') throw notOwner();
    return this.inviteUrl(groupId, member.group.inviteVersion);
  }

  /** A new invite: the old address stops working. */
  async newInvite(userId: string, groupId: string): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      await this.asOwner(tx, userId, groupId);
      const group = await tx.group.update({
        where: { id: groupId },
        data: { inviteVersion: { increment: 1 } },
        select: { inviteVersion: true },
      });
      await tx.group.update({
        where: { id: groupId },
        data: {
          inviteTokenHash: hashToken(inviteToken(this.secret, groupId, group.inviteVersion)),
        },
      });
      return this.inviteUrl(groupId, group.inviteVersion);
    });
  }

  /** What the join screen shows; anyone with the invite may see it. */
  async preview(token: string): Promise<InvitePreview> {
    const group = await this.prisma.group.findUnique({
      where: { inviteTokenHash: hashToken(token) },
      include: {
        members: { select: { role: true, displayName: true } },
        series: {
          orderBy: { createdAt: 'asc' },
          include: { series: { select: { title: true, deletedAt: true } } },
        },
      },
    });
    if (!group) throw notFound("This invite doesn't work any more");
    return {
      groupId: group.id,
      name: group.name,
      ownerName: group.members.find((m) => m.role === 'owner')?.displayName ?? '',
      series: group.series.filter((s) => s.series.deletedAt === null).map((s) => s.series.title),
      members: group.members.length,
    };
  }

  async join(userId: string, token: string, displayName: string): Promise<string> {
    const group = await this.prisma.group.findUnique({
      where: { inviteTokenHash: hashToken(token) },
      select: { id: true },
    });
    if (!group) throw notFound("This invite doesn't work any more");
    await this.prisma.$transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      const rev = await nextGroupRev(tx, group.id);
      // Made again while the group was locked: a new invite or the last member leaving.
      const current = await tx.group.findUnique({ where: { id: group.id } });
      if (rev === null || current?.inviteTokenHash !== hashToken(token)) {
        throw notFound("This invite doesn't work any more");
      }
      const members = await tx.groupMember.findMany({ where: { groupId: group.id } });
      if (members.some((m) => m.userId === userId)) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          GroupErrorCode.ALREADY_MEMBER,
          "You're in this group already",
        );
      }
      if (members.length >= MAX_GROUP_MEMBERS) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          GroupErrorCode.GROUP_FULL,
          `A group has at most ${MAX_GROUP_MEMBERS} members`,
        );
      }
      const member = await tx.groupMember.create({
        data: { groupId: group.id, userId, role: 'member', displayName },
      });
      await writeFeed(tx, group.id, rev, [{ entity: 'member', entityId: member.id, gone: false }]);
    });
    return group.id;
  }

  /** The caller leaves; an owner only as the last member, which deletes the group. */
  async leave(userId: string, groupId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      const rev = await nextGroupRev(tx, groupId);
      const members = await tx.groupMember.findMany({ where: { groupId } });
      const me = members.find((m) => m.userId === userId);
      if (rev === null || !me) throw notFound();
      if (members.length === 1) {
        await takeBack(tx, groupId, me.userId);
        await tx.group.delete({ where: { id: groupId } });
        return;
      }
      if (me.role === 'owner') {
        throw new ApiException(
          HttpStatus.CONFLICT,
          GroupErrorCode.OWNER_MUST_HAND_OVER,
          'Make someone else the owner first',
        );
      }
      await removeMember(tx, groupId, rev, me);
    });
  }

  /** The owner removes a member, who loses the group at their next sync. */
  async remove(ownerId: string, groupId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await lockUsers(tx, [userId]);
      const rev = await this.asOwner(tx, ownerId, groupId);
      const member = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (!member || userId === ownerId) throw notFound('No such member');
      await removeMember(tx, groupId, rev, member);
    });
  }

  /** The owner hands the group to another member, and becomes a member. */
  async handOver(ownerId: string, groupId: string, userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rev = await this.asOwner(tx, ownerId, groupId);
      if (userId === ownerId) return;
      const next = await tx.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (!next) throw notFound('No such member');
      await handOver(tx, groupId, rev, ownerId, next.id);
    });
  }

  /** The owner shares another of their own series with the group. */
  async addSeries(userId: string, groupId: string, seriesId: string): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        const rev = await this.asOwner(tx, userId, groupId);
        const series = await tx.series.findFirst({
          where: { id: seriesId, userId, deletedAt: null },
          select: { id: true },
        });
        if (!series) throw notFound('No such series');
        await tx.groupSeries.create({ data: { groupId, seriesId } });
        // Its lessons come back with what members had added to them (§17.12).
        await settleGroup(tx, groupId, rev, [{ entity: 'series', id: seriesId }]);
      });
    } catch (error) {
      throw inGroup(error);
    }
  }

  /** The owner takes a series out of the group: members lose its lessons. */
  async removeSeries(userId: string, groupId: string, seriesId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const rev = await this.asOwner(tx, userId, groupId);
      const { count } = await tx.groupSeries.deleteMany({ where: { groupId, seriesId } });
      if (count === 0) throw notFound('No such series in the group');
      await settleGroup(tx, groupId, rev);
    });
  }

  /**
   * Takes the user out of every group, before their account is deleted or disabled (§17.12). A
   * group they own passes to the member who joined first; one with no one else is deleted.
   */
  async leaveAll(userId: string, tx?: Tx): Promise<void> {
    const run = async (t: Tx) => {
      await lockUsers(t, [userId]);
      const groups = await t.groupMember.findMany({
        where: { userId },
        select: { groupId: true },
        orderBy: { groupId: 'asc' },
      });
      for (const { groupId } of groups) {
        const rev = (await nextGroupRev(t, groupId))!;
        const members = await t.groupMember.findMany({
          where: { groupId },
          orderBy: [{ joinedAt: 'asc' }, { id: 'asc' }],
        });
        const me = members.find((m) => m.userId === userId)!;
        const next = members.find((m) => m.userId !== userId);
        if (!next) {
          await takeBack(t, groupId, userId);
          await t.group.delete({ where: { id: groupId } });
          continue;
        }
        if (me.role === 'owner') await handOver(t, groupId, rev, userId, next.id);
        await removeMember(t, groupId, rev, me);
      }
    };
    await (tx ? run(tx) : this.prisma.$transaction(run));
  }

  /** Locks the group and takes its next rev, if the user owns it. */
  private async asOwner(tx: Tx, userId: string, groupId: string): Promise<bigint> {
    const rev = await nextGroupRev(tx, groupId);
    const member =
      rev === null
        ? null
        : await tx.groupMember.findUnique({ where: { groupId_userId: { groupId, userId } } });
    if (rev === null || !member) throw notFound();
    if (member.role !== 'owner') throw notOwner();
    return rev;
  }

  private inviteUrl(groupId: string, version: number): string {
    return `${this.appUrl}/join?token=${inviteToken(this.secret, groupId, version)}`;
  }
}

/** Locks users' rows in id order, before any group's (§17.12). */
async function lockUsers(tx: Tx, userIds: readonly string[]): Promise<void> {
  const ids = [...userIds].toSorted();
  await tx.$queryRaw`SELECT 1 FROM "user" WHERE id = ANY(${ids}::uuid[]) ORDER BY id FOR UPDATE`;
}

/**
 * Takes a member out (decision 98): their membership and the series they shared, and everything
 * they added goes back to being their own (`takeBack`). The feed drops all of it, and what others
 * added to their lessons, at one rev.
 */
async function removeMember(
  tx: Tx,
  groupId: string,
  rev: bigint,
  member: { id: string; userId: string },
): Promise<void> {
  await takeBack(tx, groupId, member.userId);
  await tx.groupSeries.deleteMany({ where: { groupId, series: { userId: member.userId } } });
  await tx.groupMember.delete({ where: { id: member.id } });
  await settleGroup(tx, groupId, rev);
}

/**
 * What a member put in a group comes back to them as they leave it (decision 98), at one new rev of
 * theirs, so their devices pull it: their group sections and questions become private notes, their
 * comments are deleted, and their own lessons for the group's lessons take the group lesson's
 * details, so they read as ordinary lessons. Their user row is locked already.
 */
async function takeBack(tx: Tx, groupId: string, userId: string): Promise<void> {
  const where = { userId, groupId, visibility: 'group' };
  const [sections, questions, comments] = [
    await tx.section.count({ where }),
    await tx.question.count({ where }),
    await tx.comment.count({ where: { userId, groupId, deletedAt: null } }),
  ];
  const shared = await tx.groupSeries.findMany({
    where: { groupId, series: { userId: { not: userId } } },
    select: { seriesId: true },
  });
  const groupLessons = await tx.lesson.findMany({
    where: { seriesId: { in: shared.map((s) => s.seriesId) } },
  });
  const own = await tx.lesson.findMany({
    where: { userId, groupLessonId: { in: groupLessons.map((l) => l.id) } },
    select: { id: true, groupLessonId: true },
  });
  if (sections + questions + comments + own.length === 0) return;

  const [row] = await tx.$queryRaw<{ sync_rev: bigint }[]>`
    UPDATE "user" SET sync_rev = sync_rev + 1 WHERE id = ${userId}::uuid RETURNING sync_rev`;
  const rev = row!.sync_rev;
  const now = new Date();
  const mine = { visibility: 'private', groupId: null, rev, updatedAt: now };
  await tx.section.updateMany({ where, data: { ...mine, sharedAt: null } });
  await tx.question.updateMany({ where, data: mine });
  await tx.comment.updateMany({
    where: { userId, groupId, deletedAt: null },
    data: { deletedAt: now, updatedAt: now, rev },
  });
  const byId = new Map(groupLessons.map((l) => [l.id, l]));
  for (const lesson of own) {
    const from = byId.get(lesson.groupLessonId!)!;
    await tx.lesson.update({
      where: { id: lesson.id },
      data: {
        title: from.title,
        date: from.date,
        kind: from.kind,
        speaker: from.speaker,
        church: from.church,
        mainPassages: from.mainPassages ?? [],
        updatedAt: now,
        rev,
      },
    });
  }
}

/** Makes `nextId` the owner and the current owner a member; one owner at a time (an index). */
async function handOver(
  tx: Tx,
  groupId: string,
  rev: bigint,
  ownerId: string,
  nextId: string,
): Promise<void> {
  const owner = await tx.groupMember.update({
    where: { groupId_userId: { groupId, userId: ownerId } },
    data: { role: 'member' },
  });
  await tx.groupMember.update({ where: { id: nextId }, data: { role: 'owner' } });
  await writeFeed(tx, groupId, rev, [
    { entity: 'member', entityId: owner.id, gone: false },
    { entity: 'member', entityId: nextId, gone: false },
  ]);
}

function notOwner(): ApiException {
  return new ApiException(
    HttpStatus.FORBIDDEN,
    GroupErrorCode.NOT_GROUP_OWNER,
    "Only the group's owner can do that",
  );
}

/** A series already in a group breaks `group_series`'s unique series: `409 IN_GROUP`. */
function inGroup(error: unknown): unknown {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return new ApiException(
      HttpStatus.CONFLICT,
      GroupErrorCode.IN_GROUP,
      'The series is already in a group',
    );
  }
  return error;
}
