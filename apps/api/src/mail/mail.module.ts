import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { EMAIL_CLIENT, createEmailClient } from './email-client.js';
import { MailService } from './mail.service.js';

@Module({
  providers: [
    {
      provide: EMAIL_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createEmailClient(
          config.get('NODE_ENV', { infer: true }),
          config.get('RESEND_API_KEY', { infer: true }),
        ),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
