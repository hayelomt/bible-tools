import { Module } from '@nestjs/common';
import { GroupPullService } from './group-pull.service.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitesController } from './invites.controller.js';

/** Groups, members, invites and each group's feed (F35, M13-07, §17.12). */
@Module({
  controllers: [GroupsController, InvitesController],
  providers: [GroupsService, GroupPullService],
  exports: [GroupsService],
})
export class GroupsModule {}
