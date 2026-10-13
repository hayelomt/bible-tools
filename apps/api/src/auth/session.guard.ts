import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { ApiException, ErrorCode } from '../common/errors.js';
import { type AuthRequest, IS_PUBLIC } from './auth.decorators.js';
import { SessionsService, readSessionToken } from './sessions.service.js';

/** Global: loads the session from the cookie, and refuses routes that need one without it. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const http = context.switchToHttp();
    const req = http.getRequest<AuthRequest>();
    const res = http.getResponse<Response>();
    const token = readSessionToken(req);
    const auth = token ? await this.sessions.authenticate(token) : null;
    if (!auth) {
      if (token) this.sessions.clearCookie(res);
      throw new ApiException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, 'Sign in first');
    }
    if (auth.renewed && token) this.sessions.setCookie(res, token, auth.session.expiresAt);
    req.auth = { user: auth.user, session: auth.session };
    return true;
  }
}
