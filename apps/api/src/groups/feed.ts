import type { GroupEntity } from '@lamp/domain';
import { Prisma } from '../generated/prisma/client.js';

type Tx = Prisma.TransactionClient;

/** One thing a group's members see, as it now stands for them. */
export interface FeedEntry {
  entity: GroupEntity;
  entityId: string;
  gone: boolean;
}

/**
 * Takes the group's next feed revision (§17.12), locking the group's row until the transaction
 * ends, so one group's revisions commit in order, as a user's do (§6.3). Callers lock any user rows
 * first. Null when the group doesn't exist.
 */
export async function nextGroupRev(tx: Tx, groupId: string): Promise<bigint | null> {
  const [row] = await tx.$queryRaw<{ sync_rev: bigint }[]>`
    UPDATE "group" SET sync_rev = sync_rev + 1, updated_at = now()
    WHERE id = ${groupId}::uuid RETURNING sync_rev`;
  return row?.sync_rev ?? null;
}

/** Writes the entries at `rev`, each replacing what the group had for that row. */
export async function writeFeed(
  tx: Tx,
  groupId: string,
  rev: bigint,
  entries: readonly FeedEntry[],
): Promise<void> {
  if (entries.length === 0) return;
  await tx.$executeRaw`
    INSERT INTO group_feed (group_id, entity, entity_id, rev, gone)
    SELECT ${groupId}::uuid, t.entity, t.entity_id, ${rev}, t.gone
    FROM unnest(
      ${entries.map((e) => e.entity)}::text[],
      ${entries.map((e) => e.entityId)}::uuid[],
      ${entries.map((e) => e.gone)}::boolean[]
    ) AS t(entity, entity_id, gone)
    ON CONFLICT (group_id, entity, entity_id)
    DO UPDATE SET rev = EXCLUDED.rev, gone = EXCLUDED.gone`;
}

/** The live lessons of these series: what a group shows when the series joins it. */
export async function seriesLessons(tx: Tx, seriesIds: readonly string[]): Promise<FeedEntry[]> {
  if (seriesIds.length === 0) return [];
  const lessons = await tx.lesson.findMany({
    where: { seriesId: { in: [...seriesIds] }, deletedAt: null },
    select: { id: true },
  });
  return lessons.map((lesson) => ({ entity: 'lesson', entityId: lesson.id, gone: false }));
}

/**
 * Takes these series out of the group's feed with every lesson the group has had from them, so
 * members drop them (a series leaving, or its owner leaving).
 */
export async function seriesGone(
  tx: Tx,
  groupId: string,
  seriesIds: readonly string[],
): Promise<FeedEntry[]> {
  if (seriesIds.length === 0) return [];
  const lessons = await tx.$queryRaw<{ entity_id: string }[]>`
    SELECT f.entity_id FROM group_feed f JOIN lesson l ON l.id = f.entity_id
    WHERE f.group_id = ${groupId}::uuid AND f.entity = 'lesson' AND NOT f.gone
      AND l.series_id = ANY(${[...seriesIds]}::uuid[])`;
  return [
    ...seriesIds.map((id): FeedEntry => ({ entity: 'series', entityId: id, gone: true })),
    ...lessons.map((l): FeedEntry => ({ entity: 'lesson', entityId: l.entity_id, gone: true })),
  ];
}

/** The group a series is shared into, if any. */
export async function groupOfSeries(tx: Tx, seriesId: string | null): Promise<string | null> {
  if (!seriesId) return null;
  const shared = await tx.groupSeries.findUnique({
    where: { seriesId },
    select: { groupId: true },
  });
  return shared?.groupId ?? null;
}

/**
 * After a push wrote these lessons and series (§17.12): each one's group, if it has one, shows it
 * as it now is, or drops it once deleted. The pushing user's row is already locked.
 */
export async function refreshFeed(
  tx: Tx,
  written: readonly { entity: 'lesson' | 'series'; id: string }[],
): Promise<void> {
  const byGroup = new Map<string, FeedEntry[]>();
  for (const { entity, id } of written) {
    let groupId: string | null;
    let deleted: boolean;
    if (entity === 'series') {
      const series = await tx.series.findUnique({ where: { id }, select: { deletedAt: true } });
      groupId = await groupOfSeries(tx, id);
      deleted = series?.deletedAt !== null;
    } else {
      const lesson = await tx.lesson.findUnique({
        where: { id },
        select: { seriesId: true, deletedAt: true },
      });
      groupId = await groupOfSeries(tx, lesson?.seriesId ?? null);
      deleted = lesson?.deletedAt !== null;
    }
    if (!groupId) continue;
    const entries = byGroup.get(groupId) ?? [];
    entries.push({ entity, entityId: id, gone: deleted });
    byGroup.set(groupId, entries);
  }
  for (const [groupId, entries] of [...byGroup].toSorted(([a], [b]) => a.localeCompare(b))) {
    const rev = await nextGroupRev(tx, groupId);
    if (rev !== null) await writeFeed(tx, groupId, rev, entries);
  }
}
