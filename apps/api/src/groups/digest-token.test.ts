import { unsubscribeTokenSchema } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { digestToken, digestTokenUser } from './digest-token.js';

const SECRET = 'a-test-secret-that-is-at-least-32-characters';
const USER = '0199f0a1-2b3c-7d4e-8f50-1234567890ab';

describe('digestToken', () => {
  it('names its user, and only under the secret it was made with', () => {
    const token = digestToken(SECRET, USER);
    expect(unsubscribeTokenSchema.safeParse(token).success).toBe(true);
    expect(digestTokenUser(SECRET, token)).toBe(USER);
    expect(digestTokenUser(`${SECRET}!`, token)).toBeNull();
  });

  it('is refused for another user', () => {
    const [, mac] = digestToken(SECRET, USER).split('.');
    expect(digestTokenUser(SECRET, `0199f0a1-2b3c-7d4e-8f50-1234567890ac.${mac}`)).toBeNull();
    expect(digestTokenUser(SECRET, USER)).toBeNull();
  });
});
