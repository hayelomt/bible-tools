import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';
import { AccountController } from './account.controller.js';
import { AccountService } from './account.service.js';
import { DevicesService } from './devices.service.js';

@Module({
  imports: [AuthModule, GroupsModule],
  controllers: [AccountController],
  providers: [AccountService, DevicesService],
  exports: [DevicesService],
})
export class AccountModule {}
