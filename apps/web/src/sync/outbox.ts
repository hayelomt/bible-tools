import { type Change, type EntityName, MAX_CHANGES_PER_PUSH, type PushResult } from '@lamp/domain';
import { emitRowsChanged } from '@/data/changes.ts';
import {
  type LampDb,
  type OutboxEntry,
  type RowEntity,
  SETTINGS_KEY,
  SYNC_STATE_KEY,
} from '@/data/db.ts';

/**
 * The server takes 1 MB a push (§6.2). A batch stops short of it, leaving room for the envelope;
 * a single change larger than this still goes, alone.
 */
const MAX_BATCH_BYTES = 900_000;

/** The row a change is for: settings have no id, so there's one settings key. */
export const rowKey = (change: Change): string =>
  change.entity === 'userSettings' ? 'userSettings' : `${change.entity}:${change.entityId}`;

/** The change as pushed, without the outbox's own fields. */
export function toChange({ seq: _seq, sent: _sent, rejected: _rejected, ...change }: OutboxEntry) {
  return change as Change;
}

/**
 * The next changes to push, in order, at most 100 and under 1 MB, marked as sent.
 *
 * First, each run of unsent upserts to one row, one right after another in the outbox, becomes
 * one change (typing queues one every 500 ms). The server only builds one change on another when
 * the first was applied, so after a conflict each queued edit of a section would make its own
 * conflicted copy. The merged change keeps the first's `changeId` and `baseRev`, takes the last
 * row and time, and lists every field either edited. Only neighbours merge, so a row never moves
 * past a change that refers to it; and a sent change never merges, as the server may have applied
 * it already, so a retry sends the same changes again.
 *
 * Changes to a row with a rejected change wait behind it (§6.2), until it's discarded.
 */
export function takeBatch(db: LampDb): Promise<OutboxEntry[]> {
  return db.transaction('rw', db.outbox, async () => {
    const queued: OutboxEntry[] = [];
    for (const entry of await db.outbox.toArray()) {
      const last = queued.at(-1);
      if (last && mergeable(last, entry)) {
        const merged = merge(last, entry);
        queued[queued.length - 1] = merged;
        await db.outbox.put(merged);
        await db.outbox.delete(entry.seq!);
      } else {
        queued.push(entry);
      }
    }

    const held = new Set<string>();
    const batch: OutboxEntry[] = [];
    let bytes = 0;
    for (const entry of queued) {
      const key = rowKey(entry);
      if (entry.rejected) held.add(key);
      if (held.has(key)) continue;
      const size = JSON.stringify(toChange(entry)).length;
      if (batch.length > 0 && bytes + size > MAX_BATCH_BYTES) break;
      batch.push(entry);
      bytes += size;
      if (batch.length === MAX_CHANGES_PER_PUSH) break;
    }
    const sent = batch.map((entry) => ({ ...entry, sent: true }));
    await db.outbox.bulkPut(sent);
    return sent;
  });
}

const mergeable = (a: OutboxEntry, b: OutboxEntry) =>
  a.op === 'upsert' && b.op === 'upsert' && !a.sent && !b.sent && rowKey(a) === rowKey(b);

function merge(first: OutboxEntry, next: OutboxEntry): OutboxEntry {
  const { changed: _changed, ...rest } = next as OutboxEntry & { changed?: string[] };
  const a = (first as { changed?: string[] }).changed;
  const b = (next as { changed?: string[] }).changed;
  // No list means every field (a new row), so the merge sends every field too.
  const changed = a && b ? [...new Set([...a, ...b])] : undefined;
  return {
    ...rest,
    seq: first.seq,
    changeId: first.changeId,
    baseRev: first.baseRev,
    ...(changed ? { changed } : {}),
  } as OutboxEntry;
}

/**
 * Settles a pushed batch in one transaction: an applied or settled change leaves the outbox, and
 * the row and the changes still queued for it move to the new rev, so they don't conflict with
 * this device's own write (§6.4). The server's version of a settled conflict comes in the next
 * pull. A rejected change stays, with the reason, and holds back the row's later changes. A
 * change with no result stays as sent, and goes again.
 */
export function settleBatch(
  db: LampDb,
  batch: readonly OutboxEntry[],
  results: readonly PushResult[],
): Promise<number> {
  const byId = new Map(results.map((result) => [result.changeId, result]));
  return db.transaction('rw', db.tables, async () => {
    let settled = 0;
    for (const entry of batch) {
      const result = byId.get(entry.changeId);
      if (!result) continue;
      settled += 1;
      if (result.status === 'rejected') {
        const { errorCode, message } = result;
        await db.outbox.update(entry.seq!, { rejected: { errorCode, message } });
        continue;
      }
      await db.outbox.delete(entry.seq!);
      await queuedFor(db, entry).modify({ baseRev: result.rev });
      if (entry.entity === 'userSettings') {
        await db.userSettings.update(SETTINGS_KEY, { rev: result.rev });
      } else {
        await db.rows(entry.entity).update(entry.entityId, { rev: result.rev });
      }
    }
    await db.syncState.update(SYNC_STATE_KEY, { lastPushAt: new Date().toISOString() });
    return settled;
  });
}

/** A row of any entity; settings have no id. */
interface RowAddress {
  entity: EntityName;
  entityId?: string;
}

/** The changes still queued for a row. */
export function queuedFor(db: LampDb, { entity, entityId }: RowAddress) {
  return entity === 'userSettings'
    ? db.outbox.filter((entry) => entry.entity === 'userSettings')
    : db.outbox.where('[entity+entityId]').equals([entity, entityId!]);
}

/** Whether the outbox has a change for this row: a pulled row is skipped if so (§6.3). */
export async function hasQueued(db: LampDb, row: RowAddress): Promise<boolean> {
  return (await queuedFor(db, row).count()) > 0;
}

/**
 * Drops a rejected change and the changes held behind it. The device's copy of the row goes back
 * to the server's: a row the server never took is removed, and for any other the cursor moves
 * back to before the row's last known rev, so the next pull brings it again.
 */
export async function discardRejected(db: LampDb, seq: number): Promise<void> {
  const removed = await db.transaction('rw', db.tables, async () => {
    const entry = await db.outbox.get(seq);
    if (!entry?.rejected) return null;
    await queuedFor(db, entry).delete();
    const local =
      entry.entity === 'userSettings'
        ? await db.userSettings.get(SETTINGS_KEY)
        : await db.rows(entry.entity).get(entry.entityId);
    if (!local) return null;
    if (local.rev > 0) {
      const state = await db.syncState.get(SYNC_STATE_KEY);
      if (state && state.cursor >= local.rev) {
        await db.syncState.update(SYNC_STATE_KEY, { cursor: local.rev - 1 });
      }
      return null;
    }
    // Settings at rev 0 are this device's defaults; they stay.
    if (entry.entity === 'userSettings') return null;
    await db.rows(entry.entity).delete(entry.entityId);
    await db.citation.where('sourceId').equals(entry.entityId).delete();
    return { entity: entry.entity as RowEntity, id: entry.entityId };
  });
  if (removed) emitRowsChanged([removed]);
}
