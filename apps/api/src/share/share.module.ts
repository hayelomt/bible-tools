import { Module } from '@nestjs/common';
import { BibleTextService } from './bible-text.service.js';
import { ShareLinksController } from './share-links.controller.js';
import { ShareLinksService } from './share-links.service.js';
import { SharedPagesController } from './shared-pages.controller.js';
import { SharedRowsService } from './shared-rows.service.js';

/** Read-only share links and the pages they open (F34, M13-01 to M13-03, §17.10). */
@Module({
  controllers: [ShareLinksController, SharedPagesController],
  providers: [ShareLinksService, SharedRowsService, BibleTextService],
})
export class ShareModule {}
