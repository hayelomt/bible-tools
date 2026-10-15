import type { ErrorEvent } from '@sentry/react';
import { describe, expect, it, vi } from 'vitest';
import { reportError, setErrorReporter } from './report-error.ts';
import { scrubBreadcrumb, scrubEvent, scrubSpan, withoutQuery } from './sentry-scrub.ts';

describe('scrubEvent', () => {
  it('keeps the page but not its query, body or cookies', () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        url: 'https://lamp.example/reset-password?token=secret',
        query_string: 'token=secret',
        data: 'note text',
        cookies: { session: 'x' },
        headers: { Referer: 'https://lamp.example/verify-email?token=other', 'User-Agent': 'UA' },
      },
    };
    expect(scrubEvent(event).request).toEqual({
      url: 'https://lamp.example/reset-password',
      headers: { Referer: 'https://lamp.example/verify-email', 'User-Agent': 'UA' },
    });
  });
});

describe('scrubBreadcrumb', () => {
  it('drops what was typed or logged', () => {
    expect(scrubBreadcrumb({ category: 'console', message: 'My note' })).toBeNull();
    expect(scrubBreadcrumb({ category: 'ui.input', message: 'div.tiptap' })).toBeNull();
  });

  it('keeps navigation and requests, without their queries', () => {
    expect(
      scrubBreadcrumb({
        category: 'navigation',
        data: { from: '/reset-password?token=x', to: '/' },
      }),
    ).toEqual({ category: 'navigation', data: { from: '/reset-password', to: '/' } });
    expect(
      scrubBreadcrumb({
        category: 'fetch',
        data: { url: '/api/sync/pull?cursor=1', method: 'GET' },
      }),
    ).toEqual({ category: 'fetch', data: { url: '/api/sync/pull', method: 'GET' } });
  });
});

it('withoutQuery drops the query and the fragment', () => {
  expect(withoutQuery('/read/JHN.3?v=16#x')).toBe('/read/JHN.3');
  expect(withoutQuery('/settings')).toBe('/settings');
});

it('reportError keeps errors until Sentry has loaded, then sends them all', () => {
  const first = new Error('before');
  reportError(first);
  const send = vi.fn<(error: unknown) => void>();
  setErrorReporter(send);
  expect(send).toHaveBeenCalledWith(first);
  const second = new Error('after');
  reportError(second);
  expect(send).toHaveBeenLastCalledWith(second);
  expect(send).toHaveBeenCalledTimes(2);
});

it("scrubSpan takes the query off a span's name and URLs", () => {
  const span = scrubSpan({
    trace_id: '1',
    span_id: '2',
    name: 'GET /api/sync/pull?cursor=4&deviceName=Phone',
    start_timestamp: 0,
    status: 'ok',
    is_segment: false,
    attributes: {
      'url.full': 'https://lamp.example/api/sync/pull?cursor=4',
      'url.query': '?cursor=4',
      'http.method': 'GET',
    },
  });
  expect(span.name).toBe('GET /api/sync/pull');
  expect(span.attributes).toEqual({
    'url.full': 'https://lamp.example/api/sync/pull',
    'http.method': 'GET',
  });
});
