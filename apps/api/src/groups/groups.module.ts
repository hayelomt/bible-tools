import { Module } from '@nestjs/common';
import { MailModule } from '../mail/mail.module.js';
import { DigestController } from './digest.controller.js';
import { DigestScheduler } from './digest.scheduler.js';
import { DigestService } from './digest.service.js';
import { GroupPullService } from './group-pull.service.js';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { InvitesController } from './invites.controller.js';

/**
 * Groups, members, invites and each group's feed (F35, M13-07, §17.12), and the weekly email of
 * their activity (M13-12).
 */
@Module({
  imports: [MailModule],
  controllers: [GroupsController, InvitesController, DigestController],
  providers: [GroupsService, GroupPullService, DigestService, DigestScheduler],
  exports: [GroupsService],
})
export class GroupsModule {}
