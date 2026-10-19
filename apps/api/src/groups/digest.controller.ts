import {
  type GroupDigestRequest,
  groupDigestRequestSchema,
  type UnsubscribeQuery,
  unsubscribeQuerySchema,
} from '@lamp/domain';
import { Body, Controller, HttpCode, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { AnyOrigin, CurrentUser, Public } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
import { assertVerified } from '../sync/sync-access.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { DigestService } from './digest.service.js';

/** The weekly email of group activity (M13-12): its switch, and its unsubscribe link. */
@Controller()
export class DigestController {
  constructor(private readonly digests: DigestService) {}

  /** Settings → Groups: on or off. An email goes only to a verified address. */
  @Put('account/group-digest')
  @HttpCode(204)
  async set(
    @Body({ schema: groupDigestRequestSchema }) body: GroupDigestRequest,
    @CurrentUser() user: User,
  ): Promise<void> {
    if (body.on) assertVerified(user);
    await this.digests.setOn(user.id, body.on);
  }

  /**
   * Turns it off from the email's link, signed out: the app's page, or a mail app's one-click
   * (RFC 8058, which posts a form body this ignores, from no page of ours: any origin). The token
   * is in the query, which the logs hide. Throttled per IP, as invites are.
   */
  @Public()
  @AnyOrigin()
  @UseGuards(ThrottlerGuard)
  @SkipThrottle({ email: true })
  @Throttle({ ip: { limit: 30, ttl: 60 * 1000 } })
  @Post('email/unsubscribe')
  @HttpCode(204)
  async unsubscribe(@Query({ schema: unsubscribeQuerySchema }) query: UnsubscribeQuery) {
    await this.digests.unsubscribe(query.token);
  }
}
