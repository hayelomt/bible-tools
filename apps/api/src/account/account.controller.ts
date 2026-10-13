import {
  type DeleteAccountRequest,
  type DeviceParams,
  type DevicesResponse,
  deleteAccountRequestSchema,
  deviceParamsSchema,
} from '@lamp/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { CurrentSession, CurrentUser } from '../auth/auth.decorators.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { SessionsService } from '../auth/sessions.service.js';
import type { Session, User } from '../generated/prisma/client.js';
import { AccountService } from './account.service.js';
import { DevicesService } from './devices.service.js';

@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionsService,
    private readonly devices: DevicesService,
  ) {}

  /** The devices signed in to the account, with their last sync and version (§6.6). */
  @Get('devices')
  async listDevices(@CurrentUser() user: User): Promise<DevicesResponse> {
    return { devices: await this.devices.list(user.id) };
  }

  /** Signs a device out; it keeps its notes. Signing this device out also clears its cookie. */
  @Delete('devices/:id')
  @HttpCode(204)
  async signOutDevice(
    @Param({ schema: deviceParamsSchema }) params: DeviceParams,
    @CurrentUser() user: User,
    @CurrentSession() session: Session,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.devices.signOut(user.id, params.id);
    if (session.deviceId === params.id) this.sessions.clearCookie(res);
  }

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
