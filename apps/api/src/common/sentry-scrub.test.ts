import type { ErrorEvent } from '@sentry/nestjs';
import { describe, expect, it } from 'vitest';
import { scrubEvent } from './sentry-scrub.js';

describe('scrubEvent', () => {
  it('removes bodies, cookies, the query string and secret headers, keeping the route', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        method: 'POST',
        url: 'https://lamp.example/api/sync/push?deviceName=Phone',
        query_string: 'deviceName=Phone',
        data: { changes: [{ row: { body: 'My private note' } }] },
        cookies: { session: 'secret' },
        headers: { Cookie: 'session=secret', Authorization: 'Bearer x', 'User-Agent': 'Chrome' },
      },
    };
    expect(scrubEvent(event).request).toEqual({
      method: 'POST',
      url: 'https://lamp.example/api/sync/push',
      headers: { 'User-Agent': 'Chrome' },
    });
  });

  it("keeps which Prisma call failed and why, not the query's values", () => {
    const event: ErrorEvent = {
      type: undefined,
      exception: {
        values: [
          {
            type: 'PrismaClientValidationError',
            value: [
              '',
              'Invalid `prisma.section.update()` invocation:',
              '',
              '{',
              '  data: { body: "My private note" }',
              '}',
              '',
              'Unknown argument `bdy`.',
            ].join('\n'),
          },
        ],
      },
    };
    expect(scrubEvent(event).exception?.values?.[0]?.value).toBe(
      'Invalid `prisma.section.update()` invocation:\nUnknown argument `bdy`.',
    );
  });

  it('leaves an event without a request alone', () => {
    const event: ErrorEvent = { type: undefined, message: 'Boom' };
    expect(scrubEvent(event)).toEqual({ type: undefined, message: 'Boom' });
  });
});
