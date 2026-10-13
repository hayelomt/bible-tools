import { describe, expect, it } from 'vitest';
import { LOCKOUT_MS, LoginLockout, MAX_FAILED_LOGINS } from './login-lockout.js';

const EMAIL = 'reader@example.com';

function failTimes(lockout: LoginLockout, times: number, at: number): void {
  for (let i = 0; i < times; i++) lockout.recordFailure(EMAIL, at);
}

describe('LoginLockout', () => {
  it('locks an email for 15 minutes after the fifth failure', () => {
    const lockout = new LoginLockout();
    failTimes(lockout, MAX_FAILED_LOGINS - 1, 0);
    expect(lockout.lockedFor(EMAIL, 0)).toBe(0);
    lockout.recordFailure(EMAIL, 1000);
    expect(lockout.lockedFor(EMAIL, 1000)).toBe(LOCKOUT_MS);
    expect(lockout.lockedFor(EMAIL, 1000 + LOCKOUT_MS - 1)).toBe(1);
    expect(lockout.lockedFor(EMAIL, 1000 + LOCKOUT_MS)).toBe(0);
  });

  it('ignores case and surrounding spaces', () => {
    const lockout = new LoginLockout();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) lockout.recordFailure(' Reader@EXAMPLE.com', 0);
    expect(lockout.lockedFor(EMAIL, 0)).toBeGreaterThan(0);
  });

  it('only counts failures inside the last 15 minutes', () => {
    const lockout = new LoginLockout();
    failTimes(lockout, MAX_FAILED_LOGINS - 1, 0);
    lockout.recordFailure(EMAIL, LOCKOUT_MS + 1);
    expect(lockout.lockedFor(EMAIL, LOCKOUT_MS + 1)).toBe(0);
  });

  it('starts counting again after a successful login', () => {
    const lockout = new LoginLockout();
    failTimes(lockout, MAX_FAILED_LOGINS - 1, 0);
    lockout.recordSuccess(EMAIL);
    lockout.recordFailure(EMAIL, 1);
    expect(lockout.lockedFor(EMAIL, 1)).toBe(0);
  });

  it('starts counting again once a lock has passed', () => {
    const lockout = new LoginLockout();
    failTimes(lockout, MAX_FAILED_LOGINS, 0);
    lockout.recordFailure(EMAIL, LOCKOUT_MS);
    expect(lockout.lockedFor(EMAIL, LOCKOUT_MS)).toBe(0);
  });

  it('keeps other emails apart', () => {
    const lockout = new LoginLockout();
    failTimes(lockout, MAX_FAILED_LOGINS, 0);
    expect(lockout.lockedFor('someone@example.com', 0)).toBe(0);
  });
});
