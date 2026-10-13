import { Module } from '@nestjs/common';
import { PullService } from './pull.service.js';
import { PushService } from './push.service.js';
import { SyncController } from './sync.controller.js';

@Module({
  controllers: [SyncController],
  providers: [PullService, PushService],
})
export class SyncModule {}
