import { Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { Env } from '../config/env.js';
import type { Session, User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashToken, newToken } from './tokens.js';

export const SESSION_COOKIE = 'lamp_session';
/** Long enough for a month offline (§7.2). */
export const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
/** Renewing writes the row and resends the cookie, so it happens at most once an hour. */
export const SESSION_RENEW_AFTER_MS = 60 * 60 * 1000;
const COOKIE_PATH = '/api';
const MAX_USER_AGENT = 512;

export interface Authenticated {
  user: User;
  session: Session;
}

export interface NewSession {
  token: string;
  expiresAt: Date;
}

/** Opaque session tokens in an `HttpOnly` cookie; only their SHA-256 is stored. */
@Injectable()
export class SessionsService {
  private readonly secure: boolean;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    // Secure except under `pnpm dev`, so a phone on the LAN can sign in over plain HTTP. Tests
    // keep it: browsers accept Secure cookies on localhost and 127.0.0.1.
    this.secure = config.get('NODE_ENV', { infer: true }) !== 'development';
  }

  async create(userId: string, userAgent: string | undefined): Promise<NewSession> {
    const token = newToken();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        createdAt: now,
        lastSeenAt: now,
        expiresAt,
        userAgent: userAgent?.slice(0, MAX_USER_AGENT) ?? null,
      },
    });
    return { token, expiresAt };
  }

  /**
   * The session and user behind a token, or null when it is unknown, expired or its user is
   * disabled. An expired session is deleted. A session last seen over an hour ago is renewed
   * for another 90 days, and `renewed` tells the caller to resend the cookie.
   */
  async authenticate(token: string): Promise<(Authenticated & { renewed: boolean }) | null> {
    const found = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!found) return null;
    const { user, ...session } = found;
    const now = new Date();
    if (session.expiresAt <= now) {
      await this.prisma.session.deleteMany({ where: { id: session.id } });
      return null;
    }
    if (user.disabledAt) return null;
    if (now.getTime() - session.lastSeenAt.getTime() < SESSION_RENEW_AFTER_MS) {
      return { user, session, renewed: false };
    }
    const renewed = await this.prisma.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
    });
    return { user, session: renewed, renewed: true };
  }

  async end(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  setCookie(res: Response, token: string, expiresAt: Date): void {
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: COOKIE_PATH,
      expires: expiresAt,
    });
  }

  clearCookie(res: Response): void {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: this.secure,
      sameSite: 'lax',
      path: COOKIE_PATH,
    });
  }
}

/** The session token from the request's cookies, if it sent one. */
export function readSessionToken(req: Request): string | undefined {
  for (const part of req.headers.cookie?.split(';') ?? []) {
    const eq = part.indexOf('=');
    if (eq !== -1 && part.slice(0, eq).trim() === SESSION_COOKIE) {
      return part.slice(eq + 1).trim() || undefined;
    }
  }
  return undefined;
}
