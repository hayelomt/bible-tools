import {
  type PullQuery,
  type PullResponse,
  pullQuerySchema,
  type PushEnvelope,
  type PushResponse,
  pushEnvelopeSchema,
} from '@lamp/domain';
import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { CurrentSession, CurrentUser } from '../auth/auth.decorators.js';
import type { Session, User } from '../generated/prisma/client.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { DevicesService } from '../account/devices.service.js';
import { PullService } from './pull.service.js';
import { PushService } from './push.service.js';
import { assertSupportedClient } from './sync-access.js';

@Controller('sync')
export class SyncController {
  constructor(
    private readonly pushes: PushService,
    private readonly pulls: PullService,
    private readonly devices: DevicesService,
  ) {}

  /**
   * Applies the device's outbox, a batch at a time; each change gets its own result (§6.2). A
   * push that goes through records the device (§6.6).
   */
  @Post('push')
  @HttpCode(200)
  async push(
    @Body({ schema: pushEnvelopeSchema }) body: PushEnvelope,
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
  ): Promise<PushResponse> {
    const response = await this.pushes.push(user, body);
    await this.devices.synced(user.id, session.id, {
      id: body.deviceId,
      name: body.deviceName,
      clientVersion: body.clientVersion,
    });
    return response;
  }

  /**
   * The account's rows written since the device's cursor, a page at a time (§6.3). A pull that
   * goes through records the device, so a new device appears on its first sync (§6.6).
   */
  @Get('pull')
  async pull(
    @Query({ schema: pullQuerySchema }) query: PullQuery,
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
  ): Promise<PullResponse> {
    assertSupportedClient(query.clientVersion);
    const page = await this.pulls.pull(user, query);
    await this.devices.synced(user.id, session.id, {
      id: query.deviceId,
      name: query.deviceName,
      clientVersion: query.clientVersion,
    });
    return page;
  }
}
