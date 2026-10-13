import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { MailModule } from '../mail/mail.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { EmailTokensService } from './email-tokens.service.js';
import { LoginLockout } from './login-lockout.js';
import { OriginGuard } from './origin.guard.js';
import { SessionGuard } from './session.guard.js';
import { SessionsService } from './sessions.service.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

@Module({
  imports: [
    MailModule,
    // Only on the routes that use ThrottlerGuard: sign-up, login and the email endpoints.
    // Counted per IP and per email (when the body has one), in memory. The lockout after failed logins is
    // separate (LoginLockout).
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'ip', ttl: FIFTEEN_MINUTES, limit: 30 },
        { name: 'email', ttl: FIFTEEN_MINUTES, limit: 10, getTracker: emailTracker },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionsService,
    EmailTokensService,
    LoginLockout,
    // Global guards run in this order: the Origin check, then the session.
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
  ],
  exports: [SessionsService],
})
export class AuthModule {}

function emailTracker(req: Partial<Pick<Request, 'ip' | 'body'>>): string {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? `email:${email.trim().toLowerCase()}` : `ip:${req.ip}`;
}
