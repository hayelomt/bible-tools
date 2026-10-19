import { groupVisitId } from '@lamp/domain';
import { action } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * Opening a group marks its activity seen (wireframes/sharing.md "Notifications"): the user's visit
 * moves on to the feed revision the device has, on every device once it syncs. Nothing is written
 * when there's nothing new.
 */
export async function markGroupSeen(
  groupId: string,
  me: string,
  db: LampDb = appDb,
): Promise<void> {
  const id = await groupVisitId(me, groupId);
  await action(db, async (w) => {
    const cursor = (await w.db.groupSync.get(groupId))?.cursor ?? 0;
    const visit = await w.db.groupVisit.get(id);
    if (visit && visit.deletedAt === null && visit.seenRev >= cursor) return;
    if (!visit) await w.create('groupVisit', { id, groupId, seenRev: cursor });
    else {
      if (visit.deletedAt !== null) await w.restore('groupVisit', id);
      await w.update('groupVisit', id, { seenRev: cursor });
    }
  });
}
