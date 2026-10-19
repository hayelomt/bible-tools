import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db.ts';
import { syncEngine } from '@/sync/sync.ts';
import { ApiRequestError, NetworkError } from './api.ts';

/**
 * Groups talk to the server (wireframes/sharing.md): every change is made online, and its rows
 * come back through the group's feed (§17.12), so after one the app syncs at once.
 */
export function afterGroupChange(): Promise<void> {
  return syncEngine.syncNow();
}

/** What a failed group action says, by the server's code. */
export function groupErrorMessage(error: unknown): string {
  if (error instanceof NetworkError) return "Couldn't reach the server. Check the connection.";
  if (!(error instanceof ApiRequestError)) return 'Something went wrong. Try again.';
  switch (error.errorCode) {
    case 'EMAIL_NOT_VERIFIED':
      return 'Verify your email first.';
    case 'IN_GROUP':
      return 'That series is in a group already.';
    case 'GROUP_FULL':
      return 'This group is full.';
    case 'ALREADY_MEMBER':
      return "You're in this group already.";
    case 'OWNER_MUST_HAND_OVER':
      return 'Make someone else the owner first.';
    case 'NOT_GROUP_OWNER':
      return "Only the group's owner can do that.";
    case 'NOT_FOUND':
      return "This group isn't there any more.";
    default:
      return 'Something went wrong. Try again.';
  }
}

/** The member row of the signed-in user in a group, from the device's copy. */
export function useMyMembership(groupId: string, userId: string | undefined) {
  return useLiveQuery(
    async () =>
      userId ? ((await db.groupMember.where({ groupId, userId }).first()) ?? null) : null,
    [groupId, userId],
  );
}
