import { describe, expect, it } from 'vitest';
import { hashPassword, isCommonPassword, verifyPassword } from './passwords.js';

describe('passwords', () => {
  it('hashes with argon2id and verifies only the same password', async () => {
    const stored = await hashPassword('correct horse battery');
    expect(stored).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(verifyPassword(stored, 'correct horse battery')).resolves.toBe(true);
    await expect(verifyPassword(stored, 'correct horse battery ')).resolves.toBe(false);
  });

  it('refuses when there is no stored hash, and a malformed hash', async () => {
    await expect(verifyPassword(null, 'anything at all')).resolves.toBe(false);
    await expect(verifyPassword('not a hash', 'anything at all')).resolves.toBe(false);
  });

  it('knows the common passwords of 10 characters or more, in any case', () => {
    expect(isCommonPassword('qwertyuiop')).toBe(true);
    expect(isCommonPassword('1234567890')).toBe(true);
    expect(isCommonPassword('QwertyUIOP')).toBe(true);
    expect(isCommonPassword('lamp unto my feet')).toBe(false);
  });
});
