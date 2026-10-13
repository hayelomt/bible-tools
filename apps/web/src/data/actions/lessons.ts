import type { Lesson } from '@lamp/domain';
import { action, type NewRow, type RowPatch } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';

export type LessonFields = NewRow<'lesson'>;

const live = <T extends { deletedAt: string | null }>(rows: T[]) =>
  rows.filter((r) => r.deletedAt === null);

/** Stores a new lesson. The id may come from the caller, so a draft's URL stays the same. */
export function createLesson(fields: LessonFields, db: LampDb = appDb): Promise<Lesson> {
  return action(db, (w) => w.create('lesson', fields));
}

/** Changes a lesson's details; moving it to a series (or out of one) is a `seriesId` change. */
export function updateLesson(
  id: string,
  patch: RowPatch<'lesson'>,
  db: LampDb = appDb,
): Promise<Lesson> {
  return action(db, (w) => w.update('lesson', id, patch));
}

/**
 * Deletes a lesson with everything in it: sections and their tags, the lesson's tags, takeaways
 * and questions (TECH-DESIGN §5.2 cascades the same way on the server). All tombstones, so they sync.
 */
export function deleteLesson(id: string, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    const sections = live(await w.db.section.where('lessonId').equals(id).toArray());
    const sectionIds = sections.map((s) => s.id);
    const sectionTags = live(await w.db.sectionTag.where('sectionId').anyOf(sectionIds).toArray());
    const lessonTags = live(await w.db.lessonTag.where('lessonId').equals(id).toArray());
    const takeaways = live(await w.db.takeaway.where('lessonId').equals(id).toArray());
    const questions = live(await w.db.question.where('lessonId').equals(id).toArray());

    for (const t of sectionTags) await w.remove('sectionTag', t.id);
    for (const s of sections) await w.remove('section', s.id);
    for (const t of lessonTags) await w.remove('lessonTag', t.id);
    for (const t of takeaways) await w.remove('takeaway', t.id);
    for (const q of questions) await w.remove('question', q.id);
    await w.remove('lesson', id);
  });
}
