import { createHash, randomBytes } from 'node:crypto';

/** 32 random bytes, base64url (43 characters): session and email tokens. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Only this is stored, so a database leak gives no working session or link. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
