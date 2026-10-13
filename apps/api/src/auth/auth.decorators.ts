import { type ExecutionContext, SetMetadata, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { Authenticated } from './sessions.service.js';

export const IS_PUBLIC = 'lamp:isPublic';

/** Every route needs a session unless it is marked public. */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

export type AuthRequest = Request & { auth?: Authenticated };

/** The signed-in user, set by `SessionGuard`. Only for routes that aren't `@Public()`. */
export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext) => {
  const auth = context.switchToHttp().getRequest<AuthRequest>().auth;
  if (!auth) throw new Error('CurrentUser used on a route without a session');
  return auth.user;
});
