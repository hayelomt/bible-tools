import { type DeleteAccountRequest, deleteAccountRequestSchema } from '@lamp/domain';
import { Body, Controller, Delete, HttpCode, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentUser } from '../auth/auth.decorators.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { SessionsService } from '../auth/sessions.service.js';
import type { User } from '../generated/prisma/client.js';
import { AccountService } from './account.service.js';

@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionsService,
  ) {}

  /** Deletes the account and all its data, signing every device out. Throttled like login. */
  @UseGuards(ThrottlerGuard)
  @Delete()
  @HttpCode(204)
  async delete(
    @Body({ schema: deleteAccountRequestSchema }) body: DeleteAccountRequest,
    @CurrentUser() user: User,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.account.delete(user, body.password);
    this.sessions.clearCookie(res);
  }
}
