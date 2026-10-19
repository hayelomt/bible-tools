import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * The token of a weekly email's unsubscribe link (M13-12, §17.12): the user's id and an
 * HMAC-SHA256 of it under `SHARE_LINK_SECRET`, base64url, signed like an invite. It works signed
 * out, and only turns that user's email off, so it never expires.
 */
export function digestToken(secret: string, userId: string): string {
  return `${userId}.${mac(secret, userId)}`;
}

/** The user a token was made for, or null when it wasn't made here. */
export function digestTokenUser(secret: string, token: string): string | null {
  const [userId, given] = token.split('.');
  if (!userId || !given) return null;
  const expected = Buffer.from(mac(secret, userId));
  const actual = Buffer.from(given);
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId : null;
}

const mac = (secret: string, userId: string) =>
  createHmac('sha256', secret).update(`group-digest:${userId}`).digest('base64url');
