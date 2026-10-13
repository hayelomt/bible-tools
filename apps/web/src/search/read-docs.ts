import type { RowRef } from '@/data/changes.ts';
import type { LampDb } from '@/data/db.ts';
import { docOf, INDEXED_ENTITIES, type SearchDoc } from './text-index.ts';

/** Every live row search looks in, as the index takes it. */
export async function allDocs(db: LampDb): Promise<SearchDoc[]> {
  const tables = await Promise.all(
    INDEXED_ENTITIES.map(async (kind) =>
      (await db.rows(kind).toArray()).map((row) => docOf(kind, row as never)),
    ),
  );
  return tables.flat().filter((doc) => doc !== null);
}

/**
 * The rows an action wrote, as the index now has them: `null` for one deleted or emptied.
 * Rows search doesn't look in are skipped.
 */
export async function changedDocs(
  refs: readonly RowRef[],
  db: LampDb,
): Promise<Array<[id: string, doc: SearchDoc | null]>> {
  const changed: Array<[string, SearchDoc | null]> = [];
  for (const kind of INDEXED_ENTITIES) {
    const ids = [...new Set(refs.filter((r) => r.entity === kind).map((r) => r.id))];
    if (ids.length === 0) continue;
    const rows = await db.rows(kind).bulkGet(ids);
    ids.forEach((id, i) => {
      const row = rows[i];
      changed.push([id, row ? docOf(kind, row as never) : null]);
    });
  }
  return changed;
}
