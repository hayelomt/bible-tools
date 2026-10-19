import {
  HttpStatus,
  type INestApplication,
  RequestMethod,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { ApiException, ErrorCode } from './common/errors.js';

/** Shared by `main.ts` and the tests, so both run the same app. */
export function configureApp(app: INestApplication): void {
  // Shared pages are at /s/<token> (F34): outside /api, so the session cookie never goes there.
  app.setGlobalPrefix('api', { exclude: [{ path: 's/{*rest}', method: RequestMethod.GET }] });
  // Caddy proxies from the same machine, so `req.ip` (rate limits) is the client's address.
  (app as NestExpressApplication).set('trust proxy', 'loopback');
  // A push carries up to 100 changes in at most 1 MB (§6.2); Express's default is 100 kB.
  (app as NestExpressApplication).useBodyParser('json', { limit: '1mb' });
  // `@Body({ schema })` and `@Query({ schema })` validate with the shared Zod schemas. The
  // details name the fields but never echo their values (a password could be one).
  app.useGlobalPipes(
    new StandardSchemaValidationPipe({
      exceptionFactory: (issues) =>
        new ApiException(
          HttpStatus.BAD_REQUEST,
          ErrorCode.VALIDATION_FAILED,
          'The request is not valid',
          {
            issues: issues.map((issue) => ({
              path: (issue.path ?? []).map((p) => String(typeof p === 'object' ? p.key : p)),
              message: issue.message,
            })),
          },
        ),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter(app.get(HttpAdapterHost)));
  app.enableShutdownHooks();
}
