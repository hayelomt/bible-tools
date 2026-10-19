import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Authenticated } from './sessions.service.js';

export const IS_PUBLIC = 'lamp:isPublic';

/** Every route needs a session unless it is marked public. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export const ANY_ORIGIN = 'lamp:anyOrigin';

/**
 * A `@Public()` route the Origin check lets through from anywhere: it uses no session, so there's
 * nothing to forge, and its caller may not be a browser on this site (a mail app's one-click
 * unsubscribe, RFC 8058). The token it's sent is what it trusts.
 */
export const AnyOrigin = (): MethodDecorator => SetMetadata(ANY_ORIGIN, true);

export type AuthRequest = Request & { auth?: Authenticated };

function authOf(context: ExecutionContext): Authenticated {
  const auth = context.switchToHttp().getRequest<AuthRequest>().auth;
  if (!auth) throw new Error('CurrentUser or CurrentSession used on a route without a session');
  return auth;
}

/** The signed-in user, set by `SessionGuard`. Only for routes that aren't `@Public()`. */
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext) => authOf(context).user,
);

/** The session the request came with, set by `SessionGuard`, like `CurrentUser`. */
export const CurrentSession = createParamDecorator(
  (_: unknown, context: ExecutionContext) => authOf(context).session,
);
