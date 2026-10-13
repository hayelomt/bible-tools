import {
  type PullQuery,
  type PullResponse,
  pullQuerySchema,
  type PushEnvelope,
  type PushResponse,
  pushEnvelopeSchema,
} from '@lamp/domain';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { PullService } from './pull.service.js';
import { PushService } from './push.service.js';
import { assertSupportedClient } from './sync-access.js';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly pushes: PushService,
    private readonly pulls: PullService,
  ) {}

  /** Applies the device's outbox, a batch at a time; each change gets its own result (§6.2). */
  @Post('push')
  @HttpCode(200)
  push(
    @Body({ schema: pushEnvelopeSchema }) body: PushEnvelope,
    @CurrentUser() user: User,
  ): Promise<PushResponse> {
    return this.pushes.push(user, body);
  }

  /** The account's rows written since the device's cursor, a page at a time (§6.3). */
  @Get('pull')
  pull(
    @Query({ schema: pullQuerySchema }) query: PullQuery,
    @CurrentUser() user: User,
  ): Promise<PullResponse> {
    assertSupportedClient(query.clientVersion);
    return this.pulls.pull(user, query);
  }
}
