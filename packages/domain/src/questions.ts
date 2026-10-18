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

type ThreadEntry = Pick<QuestionEntry, 'createdAt' | 'id' | 'deletedAt' | 'kind'>;

/**
 * Whether an open question is partly answered (wireframes/thinking.md "Question thread"): it has
 * a partial answer since it was last answered or reopened. It stays open in Review.
 */
export function partlyAnswered(entries: readonly ThreadEntry[]): boolean {
  const thread = threadOf(entries);
  const since = thread.findLastIndex((e) => e.kind === 'answered' || e.kind === 'reopened');
  return thread.slice(since + 1).some((e) => e.kind === 'partial');
}

/** What a question's thread adds up to, for "Asked 3 times since March · 1 partial answer". */
export interface Lineage {
  /** Asked and revisited entries: each time the question came up. */
  asked: number;
  partial: number;
  /** When the thread starts: its first entry's `createdAt`, or null for an empty thread. */
  since: string | null;
}

export function lineageOf(entries: readonly ThreadEntry[]): Lineage {
  const thread = threadOf(entries);
  return {
    asked: thread.filter((e) => e.kind === 'asked' || e.kind === 'revisited').length,
    partial: thread.filter((e) => e.kind === 'partial').length,
    since: thread[0]?.createdAt ?? null,
  };
}
