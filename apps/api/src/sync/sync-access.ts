import { isClientSupported, MIN_CLIENT_VERSION } from '@lamp/domain';
import { HttpStatus } from '@nestjs/common';
import { ApiException, ErrorCode } from '../common/errors.js';
import type { User } from '../generated/prisma/client.js';
import { SyncErrorCode } from './sync.errors.js';

/** Refuses an app older than `MIN_CLIENT_VERSION` with `426`, before anything is read or applied (§6.6). */
export function assertSupportedClient(clientVersion: string): void {
  if (isClientSupported(clientVersion, MIN_CLIENT_VERSION)) return;
  // Nest's `HttpStatus` has no 426 (Upgrade Required).
  throw new ApiException(
    426 as HttpStatus,
    ErrorCode.UPGRADE_REQUIRED,
    'Update Lamp to keep backing up your notes',
    { minClientVersion: MIN_CLIENT_VERSION },
  );
}

/** Sync needs a verified email (§7.2). */
export function assertVerified(user: User): void {
  if (user.emailVerifiedAt) return;
  throw new ApiException(
    HttpStatus.FORBIDDEN,
    SyncErrorCode.EMAIL_NOT_VERIFIED,
    'Verify your email to back up your notes',
  );
}
