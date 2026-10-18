import type { Lesson } from '@lamp/domain';
import { action, RowNotFoundError } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * Capture mode (F26, M11-01). Its clock counts from the lesson's `sourceStartedAt` (§17.7); a
 * lesson without one gets it when capture first opens, so coming back to capture carries on the
 * same clock, and each section's `sourceAt` keeps its place in the recording (decided 2026-10-19).
 */
export function startCapture(lessonId: string, db: LampDb = appDb): Promise<Lesson> {
  return action(db, async (w) => {
    const lesson = await w.db.lesson.get(lessonId);
    if (!lesson || lesson.deletedAt !== null) throw new RowNotFoundError('lesson', lessonId);
    if (lesson.sourceStartedAt) return lesson;
    return w.update('lesson', lessonId, { sourceStartedAt: w.now });
  });
}

/** "Set the start": when the recording starts. Every section's time moves with it. */
export function setSourceStart(lessonId: string, at: string, db: LampDb = appDb): Promise<Lesson> {
  return action(db, (w) => w.update('lesson', lessonId, { sourceStartedAt: at }));
}
