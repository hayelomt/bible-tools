import { existsSync } from 'node:fs';
import * as Sentry from '@sentry/nestjs';
import { DATA_COLLECTION, scrubEvent, scrubSpan } from './common/sentry-scrub.js';
import { envFilePaths } from './config/env.js';
import { appVersion } from './version.js';

/**
 * Errors and traces to Sentry (TECH-DESIGN §11.3), only when `SENTRY_DSN` is set, so a copy run
 * elsewhere sends nothing. Loaded before the app (`node --import ./dist/instrument.js`), so its
 * tracing sees HTTP, Express and Prisma from the start; `main.ts` imports it too, for errors at
 * least when started without the flag.
 */

// Nest reads the .env files later; the same files are read here, real environment variables
// winning as they do there.
for (const file of envFilePaths()) if (existsSync(file)) process.loadEnvFile(file);

/** A fifth of requests are traced: enough to see slow endpoints, within the free plan. */
const TRACES_SAMPLE_RATE = 0.2;

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    release: `lamp-api@${appVersion}`,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: TRACES_SAMPLE_RATE,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
  });
}
