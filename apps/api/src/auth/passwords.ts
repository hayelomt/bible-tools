import { MIN_PASSWORD_LENGTH } from '@lamp/domain';
import { hash, verify } from '@node-rs/argon2';
import { dictionary } from '@zxcvbn-ts/language-common';

/** argon2id (the library's default algorithm) at OWASP's minimum: 19 MiB, two passes, one lane. */
const ARGON2_OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

let dummyHash: Promise<string> | undefined;

/**
 * Checks a password against a stored hash. Without a hash (no such user) it still verifies
 * against a dummy, so an unknown email takes as long to refuse as a wrong password.
 */
export async function verifyPassword(
  passwordHash: string | null,
  password: string,
): Promise<boolean> {
  if (passwordHash === null) {
    dummyHash ??= hashPassword('not the password of anyone at all');
    await verify(await dummyHash, password).catch(() => false);
    return false;
  }
  return verify(passwordHash, password).catch(() => false);
}

/** The zxcvbn-ts common-password list; shorter entries already fail the length rule. */
const COMMON_PASSWORDS = new Set(
  dictionary['passwords-common']
    .filter((p) => p.length >= MIN_PASSWORD_LENGTH)
    .map((p) => p.toLowerCase()),
);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}
