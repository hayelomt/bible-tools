import { newId } from '@lamp/domain';

/**
 * Where "New lesson" goes: the lesson's own address, with an id made now, as a draft. The lesson
 * is stored once it has a title (M2-04), and the address doesn't change when it is.
 */
export function newLessonTarget(seriesId?: string) {
  return {
    to: '/lessons/$lessonId',
    params: { lessonId: newId() },
    search: { new: true, seriesId },
  } as const;
}
