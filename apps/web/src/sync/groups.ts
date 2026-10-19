import type { GroupPullResponse, PulledGroup } from '@lamp/domain';
import type { LampDb } from '@/data/db.ts';
import { ApiRequestError } from '@/lib/api.ts';

/** The group stores, one per feed entity (§17.12). */
const STORES = {
  group: 'group',
  member: 'groupMember',
  series: 'groupSeries',
  lesson: 'groupLesson',
  section: 'groupSection',
  question: 'groupQuestion',
  comment: 'groupComment',
} as const;

const groupTables = (db: LampDb) => [
  db.group,
  db.groupMember,
  db.groupSeries,
  db.groupLesson,
  db.groupSection,
  db.groupQuestion,
  db.groupComment,
  db.groupSync,
];

/**
 * Stores one page of a group's feed in one transaction: each row with its group, each gone row
 * removed, then the group's cursor.
 */
export async function applyGroupPage(
  db: LampDb,
  groupId: string,
  page: GroupPullResponse,
): Promise<void> {
  await db.transaction('rw', groupTables(db), async () => {
    for (const pulled of page.rows) {
      const table = db.table(STORES[pulled.entity]);
      if ('gone' in pulled) await table.delete(pulled.id);
      else if (pulled.entity === 'group') await db.group.put(pulled.row);
      else await table.put({ ...pulled.row, groupId, addedRev: pulled.addedRev });
    }
    await db.groupSync.put({ groupId, cursor: page.nextCursor });
  });
}

/** Everything the device holds of a group: the user left it, or was removed. */
export async function dropGroup(db: LampDb, groupId: string): Promise<void> {
  await db.transaction('rw', groupTables(db), async () => {
    await db.group.delete(groupId);
    await db.groupMember.where({ groupId }).delete();
    await db.groupSeries.where({ groupId }).delete();
    await db.groupLesson.where({ groupId }).delete();
    await db.groupSection.where({ groupId }).delete();
    await db.groupQuestion.where({ groupId }).delete();
    await db.groupComment.where({ groupId }).delete();
    await db.groupSync.delete(groupId);
  });
}

/** Every group's rows: another account's notes are going (§6.6). */
export async function clearGroups(db: LampDb): Promise<void> {
  for (const table of groupTables(db)) await table.clear();
}

export type PullGroup = (groupId: string, cursor: number) => Promise<GroupPullResponse>;

/**
 * After the user's pull (§17.12): drops the groups the user is no longer in, and pulls each group
 * whose feed moved past the device's cursor for it. A group whose pull answers `404` is gone too.
 */
export async function syncGroups(
  db: LampDb,
  groups: readonly PulledGroup[],
  pull: PullGroup,
): Promise<void> {
  const listed = new Set(groups.map((g) => g.id));
  for (const { groupId } of await db.groupSync.toArray()) {
    if (!listed.has(groupId)) await dropGroup(db, groupId);
  }
  for (const { id, rev } of groups) {
    let cursor = (await db.groupSync.get(id))?.cursor ?? 0;
    while (cursor < rev) {
      let page: GroupPullResponse;
      try {
        page = await pull(id, cursor);
      } catch (error) {
        if (error instanceof ApiRequestError && error.status === 404) {
          await dropGroup(db, id);
          break;
        }
        throw error;
      }
      await applyGroupPage(db, id, page);
      if (!page.hasMore || page.nextCursor <= cursor) break;
      cursor = page.nextCursor;
    }
  }
}
