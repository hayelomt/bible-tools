import {
  type AddGroupSeriesRequest,
  addGroupSeriesRequestSchema,
  type CreateGroupRequest,
  createGroupRequestSchema,
  type GroupIdResponse,
  type GroupMemberParams,
  groupMemberParamsSchema,
  type GroupOwnerRequest,
  groupOwnerRequestSchema,
  type GroupParams,
  groupParamsSchema,
  type GroupPullQuery,
  groupPullQuerySchema,
  type GroupPullResponse,
  type GroupSeriesParams,
  groupSeriesParamsSchema,
  type InviteResponse,
  type RenameGroupRequest,
  renameGroupRequestSchema,
} from '@lamp/domain';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/auth.decorators.js';
import type { User } from '../generated/prisma/client.js';
import { assertVerified } from '../sync/sync-access.js';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { GroupPullService } from './group-pull.service.js';
import { GroupsService } from './groups.service.js';

/**
 * Groups (F35, M13-07, §17.12): made and changed online by their members, and read through each
 * group's feed. Sync needs a verified email, and so do groups.
 */
@Controller('groups')
export class GroupsController {
  constructor(
    private readonly groups: GroupsService,
    private readonly pulls: GroupPullService,
  ) {}

  @Post()
  async create(
    @Body({ schema: createGroupRequestSchema }) body: CreateGroupRequest,
    @CurrentUser() user: User,
  ): Promise<GroupIdResponse> {
    assertVerified(user);
    return { groupId: await this.groups.create(user.id, body) };
  }

  /** The group's feed after the device's cursor for it (§17.12). */
  @Get(':id/pull')
  pull(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @Query({ schema: groupPullQuerySchema }) query: GroupPullQuery,
    @CurrentUser() user: User,
  ): Promise<GroupPullResponse> {
    return this.pulls.pull(user, params.id, query);
  }

  @Patch(':id')
  @HttpCode(204)
  async rename(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @Body({ schema: renameGroupRequestSchema }) body: RenameGroupRequest,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.rename(user.id, params.id, body.name);
  }

  /** The invite's address (owner). */
  @Get(':id/invite')
  async invite(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @CurrentUser() user: User,
  ): Promise<InviteResponse> {
    return { url: await this.groups.invite(user.id, params.id) };
  }

  /** A new invite (owner): the old address stops working. */
  @Post(':id/invite')
  @HttpCode(200)
  async newInvite(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @CurrentUser() user: User,
  ): Promise<InviteResponse> {
    return { url: await this.groups.newInvite(user.id, params.id) };
  }

  @Post(':id/leave')
  @HttpCode(204)
  async leave(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.leave(user.id, params.id);
  }

  @Delete(':id/members/:userId')
  @HttpCode(204)
  async remove(
    @Param({ schema: groupMemberParamsSchema }) params: GroupMemberParams,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.remove(user.id, params.id, params.userId);
  }

  @Post(':id/owner')
  @HttpCode(204)
  async handOver(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @Body({ schema: groupOwnerRequestSchema }) body: GroupOwnerRequest,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.handOver(user.id, params.id, body.userId);
  }

  @Post(':id/series')
  @HttpCode(204)
  async addSeries(
    @Param({ schema: groupParamsSchema }) params: GroupParams,
    @Body({ schema: addGroupSeriesRequestSchema }) body: AddGroupSeriesRequest,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.addSeries(user.id, params.id, body.seriesId);
  }

  @Delete(':id/series/:seriesId')
  @HttpCode(204)
  async removeSeries(
    @Param({ schema: groupSeriesParamsSchema }) params: GroupSeriesParams,
    @CurrentUser() user: User,
  ): Promise<void> {
    await this.groups.removeSeries(user.id, params.id, params.seriesId);
  }
}
