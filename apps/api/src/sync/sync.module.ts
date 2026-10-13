import { Module } from '@nestjs/common';
import { PushService } from './push.service.js';
import { SyncController } from './sync.controller.js';

@Module({
  controllers: [SyncController],
  providers: [PushService],
})
export class SyncModule {}
