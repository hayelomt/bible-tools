import type { Section } from '@lamp/domain';
import { midnightOf, type SourceMoment } from '@/lib/source-time.ts';
import { action, RowNotFoundError } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

/**
 * A section's time or page in its lesson's source (F28, M11-07), from "Time or page…": a time is
 * stored as the moment `sourceStartedAt + ms`, so moving the start moves it too. A lesson without
 * a start gets midnight on its date (decided 2026-10-19). Null takes both away.
 */
export function setSectionMoment(
  sectionId: string,
  moment: SourceMoment | null,
  db: LampDb = appDb,
): Promise<Section> {
  return action(db, async (w) => {
    const section = await w.db.section.get(sectionId);
    if (!section || section.deletedAt !== null) throw new RowNotFoundError('section', sectionId);
    if (moment?.kind !== 'time') {
      return w.update('section', sectionId, {
        sourceAt: null,
        sourcePage: moment ? moment.page : null,
      });
    }
    const lesson = await w.db.lesson.get(section.lessonId);
    if (!lesson || lesson.deletedAt !== null)
      throw new RowNotFoundError('lesson', section.lessonId);
    let start = lesson.sourceStartedAt;
    if (!start) {
      start = midnightOf(lesson.date);
      await w.update('lesson', lesson.id, { sourceStartedAt: start });
    }
    return w.update('section', sectionId, {
      sourceAt: new Date(Date.parse(start) + moment.ms).toISOString(),
      sourcePage: null,
    });
  });
}
