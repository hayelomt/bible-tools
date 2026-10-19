import {
  type GroupIdResponse,
  type InvitePreview,
  type InviteRequest,
  inviteRequestSchema,
  type JoinGroupRequest,
  joinGroupRequestSchema,
} from '@lamp/domain';
import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { SkipThrottle, Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser, Public } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
import { assertVerified } from '../sync/sync-access.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { GroupsService } from './groups.service.js';

/**
 * Invites (§17.12): the token travels in the body, never in a path, so logs and error reports
 * never hold it. Throttled per IP, as shared pages are, so tokens can't be guessed at speed.
 */
@Controller('invites')
@UseGuards(ThrottlerGuard)
@SkipThrottle({ email: true })
@Throttle({ ip: { limit: 30, ttl: 60 * 1000 } })
export class InvitesController {
  constructor(private readonly groups: GroupsService) {}

  /** What the join screen shows, signed in or not. */
  @Public()
  @Post('preview')
  @HttpCode(200)
  preview(@Body({ schema: inviteRequestSchema }) body: InviteRequest): Promise<InvitePreview> {
    return this.groups.preview(body.token);
  }

  @Post('join')
  @HttpCode(200)
  async join(
    @Body({ schema: joinGroupRequestSchema }) body: JoinGroupRequest,
    @CurrentUser() user: User,
  ): Promise<GroupIdResponse> {
    assertVerified(user);
    return { groupId: await this.groups.join(user.id, body.token, body.displayName) };
  }
}
