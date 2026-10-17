import * as Sentry from '@sentry/react';
import type { AnyRouter } from '@tanstack/react-router';
import { CLIENT_VERSION } from './api.ts';
import { setErrorReporter } from './report-error.ts';
import { setScreenTracer } from './screen-ready.ts';
import { DATA_COLLECTION, scrubBreadcrumb, scrubEvent, scrubSpan } from './sentry-scrub.ts';

/** A fifth of page loads and navigations are traced: enough to see slow screens, cheaply. */
const TRACES_SAMPLE_RATE = 0.2;

/**
 * Errors and traces to Sentry (TECH-DESIGN §11.3). Loaded by `main.tsx` after the first render,
 * and only when the build has `VITE_SENTRY_DSN`, so it never slows the first screen and a copy
 * built elsewhere sends nothing. Traces name the route (`/lessons/$lessonId`), and the API's
 * share the trace of the request that called them (same origin). A screen's wait for its local data
 * is a `ui.screen.ready` span (`src/lib/screen-ready.ts`).
 */
export function startSentry(dsn: string, router: AnyRouter): void {
  Sentry.init({
    dsn,
    release: `lamp-web@${CLIENT_VERSION}`,
    environment: import.meta.env.MODE,
    integrations: [Sentry.tanstackRouterBrowserTracingIntegration(router)],
    tracesSampleRate: TRACES_SAMPLE_RATE,
    dataCollection: DATA_COLLECTION,
    beforeSend: scrubEvent,
    beforeSendSpan: scrubSpan,
    beforeBreadcrumb: scrubBreadcrumb,
  });
  setErrorReporter((error) => Sentry.captureException(error));
  // Started inside the navigation that showed the screen, so that navigation waits for it.
  setScreenTracer((screen, startedAt) => {
    const span = Sentry.startInactiveSpan({
      name: `screen ready ${screen}`,
      op: 'ui.screen.ready',
      startTime: new Date(startedAt),
      attributes: { 'screen.name': screen },
    });
    return {
      end(outcome) {
        span.setAttribute('screen.outcome', outcome);
        span.end();
      },
    };
  });
}
