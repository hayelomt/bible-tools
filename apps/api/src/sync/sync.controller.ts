import { type PushEnvelope, type PushResponse, pushEnvelopeSchema } from '@lamp/domain';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { PushService } from './push.service.js';

@Controller('sync')
export class SyncController {
  constructor(private readonly pushes: PushService) {}

  /** Applies the device's outbox, a batch at a time; each change gets its own result (§6.2). */
  @Post('push')
  @HttpCode(200)
  push(
    @Body({ schema: pushEnvelopeSchema }) body: PushEnvelope,
    @CurrentUser() user: User,
  ): Promise<PushResponse> {
    return this.pushes.push(user, body);
  }
}
