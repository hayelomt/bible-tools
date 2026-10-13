import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginLockout } from './login-lockout.js';
import { OriginGuard } from './origin.guard.js';
import { SessionGuard } from './session.guard.js';
import { SessionsService } from './sessions.service.js';

const FIFTEEN_MINUTES = 15 * 60 * 1000;

@Module({
  imports: [
    // Only on the routes that use ThrottlerGuard (sign-up and login; the email endpoints in
    // M3-02). Counted per IP and per email, in memory. The lockout after failed logins is
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
