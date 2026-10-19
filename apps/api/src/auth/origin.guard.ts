import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ApiException } from '../common/errors.js';
import { ANY_ORIGIN } from './auth.decorators.js';
import { AuthErrorCode } from './auth.errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global CSRF check beside the SameSite cookie (§7.2): a request that can change something must
 * carry an `Origin` naming the host it was sent to. The web app and the API share one origin
 * (Caddy, or Vite's proxy in development, pass the browser's `Host` through), so there is
 * nothing to configure. A route marked `@AnyOrigin()` (no session, a token instead) is let through.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) return true;
    if (this.reflector.get<boolean>(ANY_ORIGIN, context.getHandler())) return true;
    if (sameHost(req.headers.origin, req.headers.host)) return true;
    throw new ApiException(
      HttpStatus.FORBIDDEN,
      AuthErrorCode.BAD_ORIGIN,
      'The request did not come from this site',
    );
  }
}

function sameHost(origin: string | undefined, host: string | undefined): boolean {
  if (!origin || !host || !URL.canParse(origin)) return false;
  return new URL(origin).host === host.toLowerCase();
}
