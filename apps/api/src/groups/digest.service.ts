import { activityLine, type ActivityItem, groupActivity } from '@lamp/domain';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import { ApiException, ErrorCode } from '../common/errors.js';
import type { Env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { MailService } from '../mail/mail.service.js';
import { type DigestGroup, groupDigest } from '../mail/templates.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { digestToken, digestTokenUser } from './digest-token.js';
import { type FeedRef, feedKey, visibility } from './feed.js';

type Tx = Prisma.TransactionClient;

const DAY = 24 * 60 * 60 * 1000;

/** Monday 00:00 UTC of the week `now` is in: the weekly email goes once a week from then. */
export function weekStart(now: Date): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * DAY);
}

/** A group's activity for one member in a window, as the email says it. */
export interface GroupWeek {
  groupId: string;
  name: string;
  items: (ActivityItem & { who: string; lessonTitle: string })[];
}

/**
 * The weekly email of group activity (F35, M13-12, §17.12), off until the member turns it on:
 * replies to their sections, comments on them and others' questions in each of their groups, the
 * same as the group page's activity (decided 2026-10-19), for what reached each group since the
 * last one. Sent by the API's own timer (`DigestScheduler`), once a week from Monday 00:00 UTC.
 */
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);
  private readonly appUrl: string;
  private readonly secret: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    config: ConfigService<Env, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
    this.secret = config.get('SHARE_LINK_SECRET', { infer: true });
  }

  /** Turns the email on or off. Turned on, the first covers what happens from now. */
  async setOn(userId: string, on: boolean): Promise<void> {
    if (on) {
      await this.prisma.user.updateMany({
        where: { id: userId, groupDigest: false },
        data: { groupDigest: true, groupDigestSentAt: new Date() },
      });
    } else {
      await this.prisma.user.update({ where: { id: userId }, data: { groupDigest: false } });
    }
  }

  /** An unsubscribe link, signed out: `404` for a token not made here or a user who's gone. */
  async unsubscribe(token: string): Promise<void> {
    const userId = digestTokenUser(this.secret, token);
    const { count } = userId
      ? await this.prisma.user.updateMany({ where: { id: userId }, data: { groupDigest: false } })
      : { count: 0 };
    if (count === 0) throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Not found');
  }

  /**
   * Sends each email due at `now`: a member with it on, verified and not disabled, who hasn't had
   * one since this week began. Each is claimed first (its sent time moved on under a row lock), so
   * two runs never send one twice; one that fails to send is logged and waits for next week.
   * Answers how many were sent.
   */
  async sendDue(now = new Date()): Promise<number> {
    const since = weekStart(now);
    const due = await this.prisma.user.findMany({
      where: {
        groupDigest: true,
        emailVerifiedAt: { not: null },
        disabledAt: null,
        OR: [{ groupDigestSentAt: null }, { groupDigestSentAt: { lt: since } }],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    let sent = 0;
    for (const { id } of due) {
      try {
        if (await this.sendOne(id, now)) sent++;
      } catch (error) {
        this.logger.error({ err: error, userId: id }, 'The weekly group email failed');
      }
    }
    return sent;
  }

  /** One member's email, if it's still due and anything happened. */
  private async sendOne(userId: string, now: Date): Promise<boolean> {
    const claimed = await this.prisma.$transaction(async (tx) => {
      const [user] = await tx.$queryRaw<{ email: string; sent_at: Date | null }[]>`
        SELECT email, group_digest_sent_at AS sent_at FROM "user"
        WHERE id = ${userId}::uuid AND group_digest AND disabled_at IS NULL
          AND (group_digest_sent_at IS NULL OR group_digest_sent_at < ${weekStart(now)})
        FOR UPDATE`;
      if (!user) return null;
      await tx.user.update({ where: { id: userId }, data: { groupDigestSentAt: now } });
      // At most a week back: a server that was down doesn't send a month at once.
      const weekAgo = new Date(now.getTime() - 7 * DAY);
      const from = user.sent_at && user.sent_at > weekAgo ? user.sent_at : weekAgo;
      return { email: user.email, weeks: await activitySince(tx, userId, from, now) };
    });
    const groups = claimed?.weeks.filter((week) => week.items.length > 0) ?? [];
    if (!claimed || groups.length === 0) return false;
    await this.mail.send(
      claimed.email,
      groupDigest(
        groups.map((g) => this.part(g)),
        this.links(userId),
      ),
    );
    return true;
  }

  private part(week: GroupWeek): DigestGroup {
    return {
      name: week.name,
      link: new URL(`/groups/${week.groupId}`, this.appUrl).toString(),
      lines: week.items.map((item) => `${activityLine(item, item.who)} in ${item.lessonTitle}`),
    };
  }

  private links(userId: string) {
    const token = encodeURIComponent(digestToken(this.secret, userId));
    return {
      unsubscribe: new URL(`/unsubscribe?token=${token}`, this.appUrl).toString(),
      oneClick: new URL(`/api/email/unsubscribe?token=${token}`, this.appUrl).toString(),
    };
  }
}

/**
 * Each of the member's groups, with what reached it in [from, to) that's for them, as members see
 * it now: the group's rules are asked again, so a reply deleted since isn't listed.
 */
export async function activitySince(
  tx: Tx,
  userId: string,
  from: Date,
  to: Date,
): Promise<GroupWeek[]> {
  const memberships = await tx.groupMember.findMany({
    where: { userId },
    include: { group: { select: { name: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  const weeks: GroupWeek[] = [];
  for (const { groupId, group } of memberships) {
    const added = await tx.groupFeed.findMany({
      where: {
        groupId,
        gone: false,
        entity: { in: ['section', 'question', 'comment'] },
        addedAt: { gte: from, lt: to },
      },
      select: { entity: true, entityId: true, addedRev: true },
    });
    if (added.length === 0) {
      weeks.push({ groupId, name: group.name, items: [] });
      continue;
    }
    const mine = await tx.section.findMany({
      where: { userId, groupId, visibility: 'group', deletedAt: null },
      select: { id: true },
    });
    const refs: FeedRef[] = [
      ...added.map((a) => ({ entity: a.entity as FeedRef['entity'], id: a.entityId })),
      ...mine.map((s) => ({ entity: 'section' as const, id: s.id })),
    ];
    const { visible, threads } = await visibility(tx, groupId, refs);
    const seen = (entity: FeedRef['entity'], id: string) => visible.has(feedKey(entity, id));
    const addedRev = new Map(added.map((a) => [a.entityId, Number(a.addedRev)]));
    const sectionIds = refs.filter((r) => r.entity === 'section' && seen('section', r.id));
    const sections = await tx.section.findMany({
      where: { id: { in: sectionIds.map((r) => r.id) } },
      select: { id: true, userId: true, replyToId: true, sharedAt: true, createdAt: true },
    });
    const questions = await tx.question.findMany({
      where: {
        id: {
          in: added
            .filter((a) => a.entity === 'question' && seen('question', a.entityId))
            .map((a) => a.entityId),
        },
      },
      select: { id: true, userId: true, text: true, createdAt: true },
    });
    const comments = await tx.comment.findMany({
      where: {
        id: {
          in: added
            .filter((a) => a.entity === 'comment' && seen('comment', a.entityId))
            .map((a) => a.entityId),
        },
      },
      select: { id: true, userId: true, sectionId: true, createdAt: true },
    });
    const items = groupActivity(userId, {
      sections: sections.map((s) => ({
        id: s.id,
        userId: s.userId,
        groupLessonId: threads.get(feedKey('section', s.id))!,
        replyToId: s.replyToId,
        sharedAt: s.sharedAt?.toISOString() ?? null,
        createdAt: s.createdAt.toISOString(),
        addedRev: addedRev.get(s.id) ?? 0,
      })),
      questions: questions.map((q) => ({
        id: q.id,
        userId: q.userId,
        groupLessonId: threads.get(feedKey('question', q.id))!,
        text: q.text,
        createdAt: q.createdAt.toISOString(),
        addedRev: addedRev.get(q.id) ?? 0,
      })),
      comments: comments.map((c) => ({
        id: c.id,
        userId: c.userId,
        sectionId: c.sectionId,
        createdAt: c.createdAt.toISOString(),
        addedRev: addedRev.get(c.id) ?? 0,
      })),
      // Only what reached the group in the window: a reply from before isn't news.
    }).filter((item) => addedRev.has(item.id));
    const members = await tx.groupMember.findMany({ where: { groupId } });
    const names = new Map(members.map((m) => [m.userId, m.displayName]));
    const lessons = await tx.lesson.findMany({
      where: { id: { in: [...new Set(items.map((i) => i.groupLessonId))] } },
      select: { id: true, title: true },
    });
    const titles = new Map(lessons.map((l) => [l.id, l.title]));
    weeks.push({
      groupId,
      name: group.name,
      items: items.map((item) => ({
        ...item,
        who: names.get(item.userId) ?? 'A former member',
        lessonTitle: titles.get(item.groupLessonId) ?? 'a lesson',
      })),
    });
  }
  return weeks;
}
