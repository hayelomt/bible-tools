import type { LampDb } from './db.ts';

/**
 * Many small reads in one IndexedDB transaction (M12-11): each key's rows, or primary keys, from
 * an index. Dexie's own queries cost about three times as much each, which adds up over hundreds
 * of lessons or sections. Not seen by a live query: a caller that is one also reads the table
 * through Dexie, so that it's read again when the table changes.
 */
export function eachByIndex<T>(
  db: LampDb,
  table: string,
  index: string,
  keys: readonly string[],
  read: 'rows' | 'keys' = 'rows',
): Promise<T[][]> {
  if (keys.length === 0) return Promise.resolve([]);
  const source = db.backendDB().transaction(table).objectStore(table).index(index);
  return Promise.all(
    keys.map(
      (key) =>
        new Promise<T[]>((resolve, reject) => {
          const request = read === 'rows' ? source.getAll(key) : source.getAllKeys(key);
          request.addEventListener('success', () => resolve(request.result as T[]));
          request.addEventListener('error', () => reject(request.error));
        }),
    ),
  );
}
