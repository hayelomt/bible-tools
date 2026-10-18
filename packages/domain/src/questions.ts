import type { QuestionEntry, QuestionStatus } from './schemas/entities.ts';

/**
 * A question's thread in order (F24, §17.5): by `createdAt`, then id, so two devices that wrote
 * entries offline put them in the same order. Deleted entries are left out.
 */
export function threadOf<E extends Pick<QuestionEntry, 'createdAt' | 'id' | 'deletedAt'>>(
  entries: readonly E[],
): E[] {
  return entries
    .filter((entry) => entry.deletedAt === null)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/** The entry that decides a question's status: the latest live one. */
export function latestEntry<E extends Pick<QuestionEntry, 'createdAt' | 'id' | 'deletedAt'>>(
  entries: readonly E[],
): E | undefined {
  return threadOf(entries).at(-1);
}

/**
 * A question's status, from its entries (decision 58): the latest live entry decides. `answered`
 * gives answered while its section has an answer (`hasAnswer`: text below its heading), and open
 * otherwise, so the status follows the answer as in v1; `parked` gives parked; every other kind
 * gives open. A question with no entries is open.
 */
export function questionStatus(
  entries: readonly Pick<QuestionEntry, 'createdAt' | 'id' | 'deletedAt' | 'kind' | 'sectionId'>[],
  hasAnswer: (sectionId: string) => boolean,
): QuestionStatus {
  const latest = latestEntry(entries);
  switch (latest?.kind) {
    case 'answered':
      return latest.sectionId !== null && hasAnswer(latest.sectionId) ? 'answered' : 'open';
    case 'parked':
      return 'parked';
    default:
      return 'open';
  }
}
