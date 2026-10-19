import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { AccountModule } from './account/account.module.js';
import { AuthModule } from './auth/auth.module.js';
import { type Env, envFilePaths, envSchema } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ShareModule } from './share/share.module.js';
import { SyncModule } from './sync/sync.module.js';
import { withoutShareToken } from './share/share-token.js';

@Module({
  imports: [
    // Names each trace after its route; does nothing unless Sentry was started (instrument.ts).
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: envFilePaths(),
      validationSchema: envSchema,
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // Request bodies are never logged (they hold note text); credentials are redacted.
          redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
          genReqId: (req, res) => {
            const id = req.headers['x-request-id'] ?? randomUUID();
            res.setHeader('x-request-id', id);
            return id;
          },
          autoLogging: { ignore: (req) => req.url === '/api/health' },
          // A shared page's address is its token: logged as /s/… only (§12).
          serializers: {
            req: (req: { url?: string }) => ({ ...req, url: withoutShareToken(req.url) }),
          },
        },
      }),
    }),
    PrismaModule,
    AuthModule,
    AccountModule,
    SyncModule,
    ShareModule,
    HealthModule,
  ],
})
export class AppModule {}
