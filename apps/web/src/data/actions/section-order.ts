import { compareOrder, keyBetween } from '@lamp/domain';
import type { Writer } from '../action.ts';

/** The order key that puts a new top-level section after the lesson's last one. */
export async function endOfLesson(w: Writer, lessonId: string): Promise<string> {
  const last = (
    await w.db.section
      .where('lessonId')
      .equals(lessonId)
      .filter((s) => s.deletedAt === null && s.parentId === null)
      .toArray()
  )
    .toSorted(compareOrder)
    .at(-1);
  return keyBetween(last?.orderKey ?? null, null);
}
