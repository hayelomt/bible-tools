import type { Grade } from '@lamp/domain';

/**
 * A run of memory cards (M6-02): the verses due when it started, in order. Again puts the verse at
 * the end, so it comes round again before the run ends (decided 2026-10-14); the count grows with
 * it ("3 of 3").
 */
export interface ReviewSession {
  /** Memory item ids still to grade; the first is on the card. */
  queue: string[];
  /** Cards graded so far. */
  done: number;
}

export function startSession(ids: string[]): ReviewSession {
  return { queue: ids, done: 0 };
}

/** The run after the card on top is graded. */
export function afterGrade(session: ReviewSession, grade: Grade): ReviewSession {
  const [id, ...rest] = session.queue;
  if (id === undefined) return session;
  return { queue: grade === 'again' ? [...rest, id] : rest, done: session.done + 1 };
}

/** Without the verses removed since it started (on another device, say). */
export function withoutRemoved(session: ReviewSession, live: ReadonlySet<string>): ReviewSession {
  const queue = session.queue.filter((id) => live.has(id));
  return queue.length === session.queue.length ? session : { ...session, queue };
}

/** "1 of 2": the card on top, out of every card the run has shown or will show. */
export function position(session: ReviewSession): { at: number; of: number } {
  return { at: session.done + 1, of: session.done + session.queue.length };
}
