import { isClientSupported, MIN_CLIENT_VERSION } from '@lamp/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, CLIENT_VERSION, fetchMe, login, NetworkError } from './api.ts';

const me = {
  id: '01929f4e-7b1a-7cc0-8000-000000000001',
  email: 'you@example.com',
  emailVerifiedAt: null,
  role: 'user',
  groupDigest: false,
};

afterEach(() => vi.unstubAllGlobals());

describe('the API client', () => {
  it('sends JSON and parses the account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(me)),
    );
    expect(await login({ email: 'you@example.com', password: 'secret' })).toEqual(me);
    expect(fetch).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'you@example.com', password: 'secret' }),
    });
  });

  it('reads no session as a guest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { statusCode: 401, errorCode: 'UNAUTHORIZED', message: 'Sign in first' },
          { status: 401 },
        ),
      ),
    );
    expect(await fetchMe()).toBeNull();
  });

  it('throws the error body with its code and details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            statusCode: 429,
            errorCode: 'ACCOUNT_LOCKED',
            message: 'Too many failed sign-ins; try again later',
            details: { retryAfterSeconds: 840 },
          },
          { status: 429 },
        ),
      ),
    );
    const error = await login({ email: 'you@example.com', password: 'x' }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect(error).toMatchObject({ status: 429, errorCode: 'ACCOUNT_LOCKED' });
    expect(error.retryAfterSeconds).toBe(840);
  });

  it('tells a missing connection, or a proxy with no API behind it, from an answer', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    await expect(fetchMe()).rejects.toBeInstanceOf(NetworkError);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Bad Gateway', { status: 502 })),
    );
    await expect(fetchMe()).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('the client version', () => {
  it('is one the sync API serves', () => {
    // The API and the web app ship together (§11.2): a minimum newer than this app would answer
    // its own release with 426 for ever. Raise the version in package.json with the format
    // (TECH-DESIGN §6.7).
    expect(isClientSupported(CLIENT_VERSION, MIN_CLIENT_VERSION)).toBe(true);
  });
});
