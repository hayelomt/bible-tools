import { newId, type Tag } from '@lamp/domain';
import { emitRowsChanged, type RowRef } from '@/data/changes.ts';
import type { LampDb, OutboxEntry } from '@/data/db.ts';
import { queuedFor } from './outbox.ts';

/** The rows that link a tag to something, and the column naming that something. */
const LINKS = [
  { entity: 'sectionTag', owner: 'sectionId' },
  { entity: 'lessonTag', owner: 'lessonId' },
] as const;

/**
 * Merges each tag the server never took into the account's tag of the same name (§6.6): an
 * account can't have two tags with one name, so the push would be refused as `DUPLICATE`, and every
 * link to the tag after it. This happens when a guest's notes join an account (the 24 seeded tags,
 * and any the guest made), and when two devices make the same tag offline.
 *
 * A tag counts as the account's once it has a rev; names match in any case, as on the server. The
 * local tag and its queued changes go, and its links move to the account's tag as new changes
 * (a link change sent before may have been refused, and the server answers a changeId it has seen
 * with the same result). A link the account's tag already has is dropped instead. A tag with a
 * change sent but not answered stays, as the server may have taken it.
 *
 * Runs before each push, so a device that has never pulled pulls first (see `SyncEngine`).
 */
export async function matchTagsByName(db: LampDb): Promise<void> {
  const changed: RowRef[] = [];
  await db.transaction('rw', db.tables, async () => {
    const tags = await db.tag.filter((tag) => tag.deletedAt === null).toArray();
    const synced = new Map<string, Tag>();
    for (const tag of tags) if (tag.rev > 0) synced.set(nameKey(tag), tag);

    for (const local of tags) {
      const target = synced.get(nameKey(local));
      if (local.rev > 0 || !target) continue;
      const queued = queuedFor(db, { entity: 'tag', entityId: local.id });
      if ((await queued.toArray()).some(unanswered)) continue;
      await queued.delete();
      await db.tag.delete(local.id);
      changed.push({ entity: 'tag', id: local.id });

      for (const { entity, owner } of LINKS) {
        const table = db.rows(entity);
        const links = await table.where('tagId').equals(local.id).toArray();
        for (const link of links) {
          const ownerId = (link as Record<string, unknown>)[owner];
          const duplicate = await table
            .where('tagId')
            .equals(target.id)
            .filter(
              (other) =>
                other.deletedAt === null && (other as Record<string, unknown>)[owner] === ownerId,
            )
            .first();
          const linkQueue = queuedFor(db, { entity, entityId: link.id });
          changed.push({ entity, id: link.id });
          if (duplicate && link.deletedAt === null) {
            await linkQueue.delete();
            await table.delete(link.id);
            continue;
          }
          await table.put({ ...link, tagId: target.id });
          await linkQueue.modify((entry: OutboxEntry) => {
            entry.changeId = newId();
            delete entry.sent;
            delete entry.rejected;
            if (entry.op === 'upsert') (entry.row as { tagId: string }).tagId = target.id;
          });
        }
      }
    }
    await mergeLinks(db, changed);
  });
  emitRowsChanged(changed);
}

/**
 * Merges the links the server never took into the account's live link of the same tag on the same
 * note: an account can't have that twice, so the push would be refused as `DUPLICATE`. This happens
 * when two devices put the same tag on a note offline (and after a tag is matched by name, above).
 * The local links and their queued changes go. If the user took them all off, the last thing they
 * did there was untag the note, so the account's link is taken off too, at that time.
 */
async function mergeLinks(db: LampDb, changed: RowRef[]): Promise<void> {
  for (const { entity, owner } of LINKS) {
    const table = db.rows(entity);
    const links = await table.toArray();
    const linkKey = (link: (typeof links)[number]) =>
      `${link.tagId}:${(link as Record<string, unknown>)[owner] as string}`;
    const local = Map.groupBy(
      links.filter((link) => link.rev === 0),
      linkKey,
    );
    for (const target of links) {
      const same = local.get(linkKey(target));
      if (target.rev === 0 || target.deletedAt !== null || !same) continue;
      const queued = same.map((link) => queuedFor(db, { entity, entityId: link.id }));
      const entries = await Promise.all(queued.map((q) => q.toArray()));
      if (entries.flat().some(unanswered)) continue;
      for (const q of queued) await q.delete();
      await table.bulkDelete(same.map((link) => link.id));
      changed.push(...same.map((link) => ({ entity, id: link.id })));
      if (same.some((link) => link.deletedAt === null)) continue;
      const at = same
        .map((link) => link.deletedAt!)
        .toSorted()
        .at(-1)!;
      await table.update(target.id, { updatedAt: at, deletedAt: at });
      await db.outbox.add({
        changeId: newId(),
        baseRev: target.rev,
        clientTime: at,
        entity,
        entityId: target.id,
        op: 'delete',
      });
      changed.push({ entity, id: target.id });
    }
  }
}

const nameKey = (tag: Tag) => tag.name.toLowerCase();

/** Sent, and no answer kept: the push failed on the way back, so the server may have taken it. */
const unanswered = (entry: OutboxEntry) => entry.sent === true && !entry.rejected;
