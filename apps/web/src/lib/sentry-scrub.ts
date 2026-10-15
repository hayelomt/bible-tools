import type { Breadcrumb, BrowserOptions, Event } from '@sentry/react';

/**
 * What the SDK may collect (TECH-DESIGN §11.3). Its defaults include request bodies and query
 * strings, and a query string can hold a password-reset token, so those are off with cookies and
 * user details. Notes never leave the device through Sentry.
 */
export const DATA_COLLECTION: BrowserOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpBodies: [],
  urlQueryParams: false,
  stackFrameVariables: false,
};

/** Breadcrumbs that can carry what was typed or logged (a note's text, an error's data). */
const DROPPED_BREADCRUMBS = new Set(['console', 'ui.input']);

/** A URL without its query string or fragment. */
export function withoutQuery(url: string): string {
  return url.split(/[?#]/, 1)[0] ?? '';
}

/**
 * The last check on what an error sends, after `DATA_COLLECTION`: the request's query string,
 * cookies and body go, and the referrer's query.
 */
export function scrubEvent<T extends Event>(event: T): T {
  const { request } = event;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (request.url) request.url = withoutQuery(request.url);
    if (request.headers?.Referer) request.headers.Referer = withoutQuery(request.headers.Referer);
  }
  return event;
}

/** A span as Sentry streams it (the default `traceLifecycle`). */
type StreamedSpan = Parameters<NonNullable<BrowserOptions['beforeSendSpan']>>[0];

/**
 * A trace's span without query strings (TECH-DESIGN §11.3): its name and its URL attributes keep
 * the path, and query attributes go. Spans are streamed one by one, so this, not
 * `beforeSendTransaction`, sees them.
 */
export function scrubSpan(span: StreamedSpan): StreamedSpan {
  span.name = withoutQuery(span.name);
  for (const [key, value] of Object.entries(span.attributes)) {
    if (/query/i.test(key)) delete span.attributes[key];
    else if (/url|target/i.test(key) && typeof value === 'string') {
      span.attributes[key] = withoutQuery(value);
    }
  }
  return span;
}

/** Keeps the breadcrumbs that show what happened, without what was typed or logged. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category && DROPPED_BREADCRUMBS.has(breadcrumb.category)) return null;
  const data = breadcrumb.data;
  if (data) {
    for (const key of ['url', 'from', 'to']) {
      if (typeof data[key] === 'string') data[key] = withoutQuery(data[key]);
    }
  }
  return breadcrumb;
}
