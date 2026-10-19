import {
  type CreateShareLinkRequest,
  formatPassage,
  getBook,
  isWholeBook,
  newId,
  type Passage,
  passageSlug,
  type ShareLink,
  type ShareTargetType,
} from '@lamp/domain';
import { HttpStatus, Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import { hashToken } from '../auth/tokens.js';
import { ApiException, ErrorCode } from '../common/errors.js';
import type { Env } from '../config/env.js';
import { Prisma, type ShareLink as StoredLink } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { shareToken } from './share-token.js';
import { SharedRowsService } from './shared-rows.service.js';

export const ShareErrorCode = {
  /** The target already has a working link; the app shows that one (one link per target). */
  SHARE_LINK_EXISTS: 'SHARE_LINK_EXISTS',
  EXPIRY_PASSED: 'EXPIRY_PASSED',
} as const;

/** `lastOpenedAt` is written at most this often, so a busy page isn't a write per view. */
const OPENED_EVERY_MS = 60 * 1000;

/**
 * Share links (F34, M13-01, §17.10): made, listed and revoked by their owner, online only. Every
 * query names the owner, so no one can list, see or revoke another account's links.
 */
@Injectable()
export class ShareLinksService {
  private readonly secret: string;
  private readonly appUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly rows: SharedRowsService,
    config: ConfigService<Env, true>,
  ) {
    this.secret = config.get('SHARE_LINK_SECRET', { infer: true });
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  /**
   * A new link to one of the owner's live lessons, series or passages. A frozen compile view
   * stores the view as it is now; a handout, what its device sent (M13-03).
   */
  async create(userId: string, request: CreateShareLinkRequest): Promise<ShareLink> {
    const now = new Date();
    const expiresAt = request.expiresAt === null ? null : new Date(request.expiresAt);
    if (expiresAt && expiresAt <= now) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ShareErrorCode.EXPIRY_PASSED,
        'The expiry date has passed',
      );
    }

    let title: string;
    let snapshot: unknown = null;
    let live = true;
    if (request.targetType === 'compile') {
      title = scopeTitle(request.passage);
      if (!request.live) {
        live = false;
        snapshot = await this.rows.commentary(userId, request.passage);
      }
    } else {
      const target =
        request.targetType === 'series'
          ? await this.rows.series(userId, request.targetId)
          : await this.rows.lesson(userId, request.targetId);
      if (!target) {
        throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Nothing to share there');
      }
      title = target.title;
      if (request.targetType === 'handout') {
        live = false;
        snapshot = request.handout;
      }
    }

    const passage = request.targetType === 'compile' ? request.passage : null;
    const targetId = request.targetType === 'compile' ? null : request.targetId;
    const existing = await this.working(userId, request.targetType, targetId, passage, now);
    if (existing) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ShareErrorCode.SHARE_LINK_EXISTS,
        'This already has a link',
        { id: existing.id },
      );
    }

    const id = newId();
    const row = await this.prisma.shareLink.create({
      data: {
        id,
        userId,
        targetType: request.targetType,
        targetId,
        passage: passage ?? Prisma.DbNull,
        tokenHash: hashToken(shareToken(this.secret, id)),
        live,
        snapshot: snapshot === null ? Prisma.DbNull : (snapshot as Prisma.InputJsonValue),
        expiresAt,
        createdAt: now,
      },
    });
    return this.toLink(row, title, false);
  }

  /** The owner's working or expired links, newest first; revoked ones leave the list. */
  async list(userId: string): Promise<ShareLink[]> {
    const rows = await this.prisma.shareLink.findMany({
      where: { userId, revokedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const lessonIds = rows.flatMap((r) =>
      r.targetType === 'lesson' || r.targetType === 'handout' ? [r.targetId!] : [],
    );
    const seriesIds = rows.flatMap((r) => (r.targetType === 'series' ? [r.targetId!] : []));
    const [lessons, series] = await Promise.all([
      this.prisma.lesson.findMany({
        where: { userId, id: { in: lessonIds } },
        select: { id: true, title: true, deletedAt: true },
      }),
      this.prisma.series.findMany({
        where: { userId, id: { in: seriesIds } },
        select: { id: true, title: true, deletedAt: true },
      }),
    ]);
    const targets = new Map([...lessons, ...series].map((t) => [t.id, t]));
    return rows.map((row) => {
      if (row.targetType === 'compile') {
        return this.toLink(row, scopeTitle(row.passage as unknown as Passage), false);
      }
      const target = targets.get(row.targetId!);
      return this.toLink(row, target?.title ?? '', !target || target.deletedAt !== null);
    });
  }

  /** Turns a link off for good (or removes an expired one from the list). */
  async revoke(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.shareLink.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      throw new ApiException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'No such link');
    }
  }

  /**
   * The working link behind a token, as a shared page opens it, noting when; null when it's
   * unknown, revoked or expired, or its owner's account is disabled.
   */
  async open(token: string): Promise<StoredLink | null> {
    const now = new Date();
    const link = await this.prisma.shareLink.findFirst({
      where: {
        tokenHash: hashToken(token),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        user: { disabledAt: null },
      },
    });
    if (!link) return null;
    if (!link.lastOpenedAt || now.getTime() - link.lastOpenedAt.getTime() >= OPENED_EVERY_MS) {
      await this.prisma.shareLink.update({ where: { id: link.id }, data: { lastOpenedAt: now } });
    }
    return link;
  }

  /** The address of a link: `<APP_URL>/s/<token>`. */
  url(id: string): string {
    return `${this.appUrl}/s/${shareToken(this.secret, id)}`;
  }

  /** The target's link that still works, if any. */
  private async working(
    userId: string,
    targetType: ShareTargetType,
    targetId: string | null,
    passage: Passage | null,
    now: Date,
  ): Promise<StoredLink | undefined> {
    const rows = await this.prisma.shareLink.findMany({
      where: {
        userId,
        targetType,
        ...(targetId ? { targetId } : {}),
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    });
    return passage
      ? rows.find((r) => passageSlug(r.passage as unknown as Passage) === passageSlug(passage))
      : rows[0];
  }

  private toLink(row: StoredLink, title: string, gone: boolean): ShareLink {
    return {
      id: row.id,
      url: this.url(row.id),
      targetType: row.targetType as ShareTargetType,
      targetId: row.targetId,
      passage: row.passage as unknown as Passage | null,
      title,
      live: row.live,
      gone,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      lastOpenedAt: row.lastOpenedAt?.toISOString() ?? null,
    };
  }
}

/** A compile view's name: "Romans 8:28", "Romans 8", or "Romans" for the whole book. */
export function scopeTitle(scope: Passage): string {
  return isWholeBook(scope) ? getBook(scope.book).name : formatPassage(scope);
}
