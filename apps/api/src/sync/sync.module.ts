import { Module } from '@nestjs/common';
import { AccountModule } from '../account/account.module.js';
import { PullService } from './pull.service.js';
import { PushService } from './push.service.js';
import { SyncController } from './sync.controller.js';

@Module({
  imports: [AccountModule],
  controllers: [SyncController],
  providers: [PullService, PushService],
})
export class SyncModule {}
