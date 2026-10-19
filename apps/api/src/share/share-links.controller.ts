import {
  type CreateShareLinkRequest,
  createShareLinkRequestSchema,
  type ShareLink,
  type ShareLinkParams,
  type ShareLinksResponse,
  shareLinkParamsSchema,
} from '@lamp/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
// A value import, not `import type`: Nest resolves the constructor parameter from its class.
import { ShareLinksService } from './share-links.service.js';

/** The owner's share links (F34, M13-01): make, list and revoke. Signed in only. */
@Controller('share-links')
export class ShareLinksController {
  constructor(private readonly links: ShareLinksService) {}

  @Post()
  create(
    @Body({ schema: createShareLinkRequestSchema }) body: CreateShareLinkRequest,
    @CurrentUser() user: User,
  ): Promise<ShareLink> {
    return this.links.create(user.id, body);
  }

  @Get()
  async list(@CurrentUser() user: User): Promise<ShareLinksResponse> {
    return { links: await this.links.list(user.id) };
  }

  /** Revokes a link: anyone who has it gets "not found" from then on. */
  @Delete(':id')
  @HttpCode(204)
  async revoke(
    @Param({ schema: shareLinkParamsSchema }) params: ShareLinkParams,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.links.revoke(user.id, params.id);
  }
}
