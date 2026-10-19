import { createHmac } from 'node:crypto';

/**
 * A share link's token (F34, §17.10): HMAC-SHA256 of its id under `SHARE_LINK_SECRET`, base64url
 * (43 characters). Only its SHA-256 is stored, to find the link by, as for sessions; the owner is
 * shown the address again by working it out from the id. A database alone gives no working link.
 */
export function shareToken(secret: string, linkId: string): string {
  return createHmac('sha256', secret).update(linkId).digest('base64url');
}

/** Whether a path segment could be a token at all, before it's looked up. */
export const isShareToken = (text: string): boolean => /^[A-Za-z0-9_-]{43}$/.test(text);

/**
 * A request's URL with its tokens hidden, for logs and error reports: a shared page's (`/s/…`) and
 * a `token` in the query (an unsubscribe link's, `?token=…`).
 */
export function withoutTokens<T extends string | undefined>(url: T): T {
  return url?.replace(/^\/s\/[^/?#]+/, '/s/…').replace(/([?&]token=)[^&#]*/g, '$1…') as T;
}
