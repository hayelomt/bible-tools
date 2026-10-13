import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import { type Env, envFilePaths, envSchema } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
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
        },
      }),
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
