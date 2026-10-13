import type { PullResponse } from '@lamp/domain';
import { reindex } from '@/data/action.ts';
import { emitRowsChanged, type RowRef } from '@/data/changes.ts';
import { type LampDb, SETTINGS_KEY, SYNC_STATE_KEY } from '@/data/db.ts';
import { hasQueued } from './outbox.ts';

/**
 * Stores one pulled page in one transaction (§6.3): each row as the server sent it, tombstones
 * included, with its citations rebuilt; then the cursor and the clock offset (§6.5). A row the
 * outbox still has a change for is skipped: the server sends the settled row again after that
 * change is pushed, since every push result takes a new rev. Screens see the rows through their
 * live queries, and the search index is told which rows changed.
 *
 * Returns how many rows were stored.
 */
export async function applyPage(
  db: LampDb,
  page: PullResponse,
  clockOffsetMs: number,
): Promise<number> {
  const changed: RowRef[] = [];
  let stored = 0;
  await db.transaction('rw', db.tables, async () => {
    for (const pulled of page.rows) {
      if (pulled.entity === 'userSettings') {
        if (await hasQueued(db, { entity: 'userSettings' })) continue;
        await db.userSettings.put(pulled.row, SETTINGS_KEY);
      } else {
        const { entity, row } = pulled;
        if (await hasQueued(db, { entity, entityId: row.id })) continue;
        await db.rows(entity).put(row);
        await reindex(db, entity, row);
        changed.push({ entity, id: row.id });
      }
      stored += 1;
    }
    await db.syncState.update(SYNC_STATE_KEY, {
      cursor: page.nextCursor,
      lastPullAt: new Date().toISOString(),
      clockOffsetMs,
    });
  });
  emitRowsChanged(changed);
  return stored;
}

/**
 * Server time minus device time (§6.5), taking the server's clock as read halfway through the
 * request.
 */
export const clockOffset = (serverTime: string, sentAt: number, receivedAt: number): number =>
  Math.round(Date.parse(serverTime) - (sentAt + receivedAt) / 2);
