import { isDue, type Lesson, type MemoryItem, type Question } from '@lamp/domain';

/**
 * What waits in the review queue: open questions of live lessons and the verses due `today` (the
 * Review tab's count, and the weekly reminder's). Pure, so the service worker counts the same
 * rows it reads without Dexie.
 */
export interface ReviewCount {
  questions: number;
  verses: number;
}

export interface QueueRows {
  questions: readonly Question[];
  lessons: readonly Lesson[];
  items: readonly MemoryItem[];
}

export function countWaiting({ questions, lessons, items }: QueueRows, today: string): ReviewCount {
  const live = new Set(lessons.filter((l) => l.deletedAt === null).map((l) => l.id));
  return {
    questions: questions.filter(
      (q) => q.deletedAt === null && q.status === 'open' && live.has(q.lessonId),
    ).length,
    verses: items.filter((item) => item.deletedAt === null && isDue(item, today)).length,
  };
}
