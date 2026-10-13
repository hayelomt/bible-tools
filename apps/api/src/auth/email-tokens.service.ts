import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { PrismaService } from '../prisma/prisma.service.js';
import { hashToken, newToken } from './tokens.js';

export type EmailTokenKind = 'verify' | 'reset';

/** A verification link may sit in an inbox for a while; a reset link works for an hour (§7.3). */
export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenKind, number> = {
  verify: 24 * 60 * 60 * 1000,
  reset: 60 * 60 * 1000,
};

type Db = Prisma.TransactionClient | PrismaService;

/** The single-use tokens in verification and reset links. Only their SHA-256 is stored. */
@Injectable()
export class EmailTokensService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(userId: string, kind: EmailTokenKind): Promise<string> {
    const token = newToken();
    const now = Date.now();
    await this.prisma.emailToken.create({
      data: {
        userId,
        kind,
        tokenHash: hashToken(token),
        createdAt: new Date(now),
        expiresAt: new Date(now + EMAIL_TOKEN_TTL_MS[kind]),
      },
    });
    return token;
  }

  /** When the user's last token of this kind was issued, if ever. */
  async lastIssuedAt(userId: string, kind: EmailTokenKind): Promise<Date | undefined> {
    const last = await this.prisma.emailToken.findFirst({
      where: { userId, kind },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    return last?.createdAt;
  }

  /**
   * Uses up a token and returns its user, or undefined when it is unknown, of another kind, used
   * or expired. The user's other unused tokens of the kind are used up with it, so an older link
   * can't be followed afterwards. Run it inside the transaction that acts on the token: the
   * conditional update lets only one of two concurrent requests through.
   */
  async consume(db: Db, token: string, kind: EmailTokenKind): Promise<string | undefined> {
    const found = await db.emailToken.findUnique({ where: { tokenHash: hashToken(token) } });
    if (!found || found.kind !== kind) return undefined;
    const now = new Date();
    const { count } = await db.emailToken.updateMany({
      where: { id: found.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (count !== 1) return undefined;
    await db.emailToken.updateMany({
      where: { userId: found.userId, kind, usedAt: null },
      data: { usedAt: now },
    });
    return found.userId;
  }
}
