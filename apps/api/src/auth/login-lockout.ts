import { Injectable } from '@nestjs/common';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * 60 * 1000;
/** Past this many tracked emails, records with nothing left to count are dropped. */
const PRUNE_ABOVE = 10_000;

interface LockRecord {
  /** Times of the failures still inside the window, oldest first. */
  failures: number[];
  lockedUntil: number;
}

/**
 * Five failed logins for one email within 15 minutes lock that email for 15 minutes, whether
 * or not an account has it (§7.2). Kept in memory: the API runs as one process, and a restart
 * only forgets the count.
 */
@Injectable()
export class LoginLockout {
  private readonly records = new Map<string, LockRecord>();

  /** Milliseconds until the email can try again; 0 when it isn't locked. */
  lockedFor(email: string, now = Date.now()): number {
    const record = this.records.get(key(email));
    return record && record.lockedUntil > now ? record.lockedUntil - now : 0;
  }

  recordFailure(email: string, now = Date.now()): void {
    if (this.records.size > PRUNE_ABOVE) this.prune(now);
    const k = key(email);
    const record = this.records.get(k) ?? { failures: [], lockedUntil: 0 };
    record.failures = record.failures.filter((t) => t > now - LOCKOUT_MS);
    record.failures.push(now);
    if (record.failures.length >= MAX_FAILED_LOGINS) {
      record.lockedUntil = now + LOCKOUT_MS;
      record.failures = [];
    }
    this.records.set(k, record);
  }

  recordSuccess(email: string): void {
    this.records.delete(key(email));
  }

  private prune(now: number): void {
    for (const [k, record] of this.records) {
      const stale = record.failures.every((t) => t <= now - LOCKOUT_MS);
      if (stale && record.lockedUntil <= now) this.records.delete(k);
    }
  }
}

function key(email: string): string {
  return email.trim().toLowerCase();
}
