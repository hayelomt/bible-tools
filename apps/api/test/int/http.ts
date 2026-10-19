import type { AddressInfo } from 'node:net';
import request from 'supertest';
import type { Response } from 'supertest';
import { SESSION_COOKIE } from '../../src/auth/sessions.service.js';
import type { TestApp } from './app.js';

export interface Client {
  /** `http://127.0.0.1:<port>`, also the `Origin` every non-GET request sends. */
  origin: string;
  get(path: string, token?: string): request.Test;
  /** A POST from the site itself: same `Origin`, the session cookie when given. */
  post(path: string, body?: object, token?: string): request.Test;
  /** A DELETE from the site itself, like `post`. */
  delete(path: string, body?: object, token?: string): request.Test;
  /** A PATCH from the site itself, like `post`. */
  patch(path: string, body?: object, token?: string): request.Test;
}

let nextIp = 1;

function withSession(test: request.Test, token?: string): request.Test {
  return token ? test.set('Cookie', `${SESSION_COOKIE}=${token}`) : test;
}

/**
 * Listens on a real port, so the requests' `Host` (and so the `Origin` the API expects) is
 * known. Each client sends its own `X-Forwarded-For`, so the per-IP rate limits of one test
 * don't reach the next. Cookies are passed by hand: supertest's jar keeps `Secure` cookies off
 * plain HTTP.
 */
export async function createClient(t: TestApp): Promise<Client> {
  if (!t.server.listening) await t.app.listen(0, '127.0.0.1');
  const origin = `http://127.0.0.1:${(t.server.address() as AddressInfo).port}`;
  const ip = `203.0.113.${nextIp++ % 250}`;
  const fromSite = (test: request.Test, body: object | undefined, token: string | undefined) =>
    withSession(
      test
        .set('Origin', origin)
        .set('X-Forwarded-For', ip)
        .send(body ?? {}),
      token,
    );
  return {
    origin,
    get: (path, token) => withSession(request(origin).get(path).set('X-Forwarded-For', ip), token),
    post: (path, body, token) => fromSite(request(origin).post(path), body, token),
    delete: (path, body, token) => fromSite(request(origin).delete(path), body, token),
    patch: (path, body, token) => fromSite(request(origin).patch(path), body, token),
  };
}

/** The session cookie a response set: its token, and its attributes in lower case. */
export function sessionCookie(res: Response): { token: string; attributes: string[] } | undefined {
  const raw: unknown = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [];
  const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) return undefined;
  const [pair = '', ...attributes] = cookie.split(';').map((p) => p.trim());
  return {
    token: pair.slice(SESSION_COOKIE.length + 1),
    attributes: attributes.map((a) => a.toLowerCase()),
  };
}
