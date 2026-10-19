import type { Event, NodeOptions } from '@sentry/nestjs';

/**
 * What the SDK may collect (TECH-DESIGN §11.3). Its defaults include request bodies, bound query
 * values and stack frames' local variables, any of which can hold note text, so all are off; so
 * are query strings, cookies and user details. Routes, statuses and timings stay.
 */
export const DATA_COLLECTION: NodeOptions['dataCollection'] = {
  userInfo: false,
  cookies: false,
  httpHeaders: { deny: ['cookie', 'set-cookie', 'authorization'] },
  httpBodies: [],
  urlQueryParams: false,
  databaseQueryData: false,
  stackFrameVariables: false,
};

/** Headers that carry a session or a password, never sent. */
const SECRET_HEADERS = new Set(['cookie', 'set-cookie', 'authorization']);

/**
 * The last check on what an error sends, after `DATA_COLLECTION`: request bodies (notes,
 * passwords), cookies, the query string, secret headers and the queries Prisma quotes are removed.
 * The URL's path, the method and the status stay, so a failing endpoint can still be found.
 */
export function scrubEvent<T extends Event>(event: T): T {
  const { request } = event;
  if (request) {
    delete request.data;
    delete request.cookies;
    delete request.query_string;
    if (request.url) request.url = withoutQuery(request.url);
    if (request.headers) {
      for (const name of Object.keys(request.headers)) {
        if (SECRET_HEADERS.has(name.toLowerCase())) delete request.headers[name];
      }
    }
  }
  for (const exception of event.exception?.values ?? []) {
    if (exception.type?.startsWith('Prisma') && exception.value) {
      exception.value = prismaMessage(exception.value);
    }
  }
  return event;
}

/**
 * A Prisma error's message without the query it quotes ("Invalid `prisma.section.update()`
 * invocation:", the arguments, then the reason): the arguments can be note text, so only the
 * first line (which call) and the last (why) are kept.
 */
function prismaMessage(message: string): string {
  const lines = message.split('\n').filter((line) => line.trim() !== '');
  return lines.length <= 2 ? lines.join('\n') : `${lines[0]}\n${lines.at(-1)}`;
}

/**
 * A URL without its query string or fragment, and with a shared page's token hidden (`/s/…`):
 * both can hold something that opens a page or an account.
 */
export function withoutQuery(url: string): string {
  return (url.split(/[?#]/, 1)[0] ?? '').replace(/\/s\/[A-Za-z0-9_-]{43}(?=\/|$)/, '/s/…');
}

/** A span as Sentry streams it (the default `traceLifecycle`). */
type StreamedSpan = Parameters<NonNullable<NodeOptions['beforeSendSpan']>>[0];

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
