import { daysBetween, type Lesson, type Question, type Takeaway } from '@lamp/domain';
import { today as todayOn } from '@/lib/dates.ts';
import { db as appDb, type LampDb } from './db.ts';
import { countWaiting, type ReviewCount } from './review-count.ts';

/**
 * The review queue's reads (F9, TECH-DESIGN §8.8): open questions, recent takeaways, and the count
 * the Review tab shows. Local queries, like the rest; a deleted lesson takes its rows with it.
 */

export interface QuestionInQueue {
  question: Question;
  lesson: Lesson;
}

export interface TakeawayInQueue {
  takeaway: Takeaway;
  lesson: Lesson;
}

/** Live lessons by id, for the rows that belong to them. */
async function liveLessons(ids: Iterable<string>, db: LampDb): Promise<Map<string, Lesson>> {
  const lessons = await db.lesson.bulkGet([...new Set(ids)]);
  return new Map(
    lessons.flatMap((lesson) => (lesson && lesson.deletedAt === null ? [[lesson.id, lesson]] : [])),
  );
}

/** Every open question, newest lesson first, then in the order asked. Parked ones stay away. */
export async function openQuestions(db: LampDb = appDb): Promise<QuestionInQueue[]> {
  const questions = await db.question
    .where('status')
    .equals('open')
    .filter((q) => q.deletedAt === null)
    .toArray();
  const lessons = await liveLessons(
    questions.map((q) => q.lessonId),
    db,
  );
  return questions
    .flatMap((question) => {
      const lesson = lessons.get(question.lessonId);
      return lesson ? [{ question, lesson }] : [];
    })
    .toSorted(
      (a, b) =>
        b.lesson.date.localeCompare(a.lesson.date) ||
        b.lesson.createdAt.localeCompare(a.lesson.createdAt) ||
        a.question.createdAt.localeCompare(b.question.createdAt) ||
        a.question.id.localeCompare(b.question.id),
    );
}

/**
 * The takeaways written in the last `days` days, today being the first, newest first. Written
 * means the takeaway's `createdAt`, on this device's calendar.
 */
export async function recentTakeaways(
  today: string,
  days: number,
  db: LampDb = appDb,
): Promise<TakeawayInQueue[]> {
  const takeaways = await db.takeaway
    .filter(
      (t) => t.deletedAt === null && daysBetween(todayOn(new Date(t.createdAt)), today) < days,
    )
    .toArray();
  const lessons = await liveLessons(
    takeaways.map((t) => t.lessonId),
    db,
  );
  return takeaways
    .flatMap((takeaway) => {
      const lesson = lessons.get(takeaway.lessonId);
      return lesson ? [{ takeaway, lesson }] : [];
    })
    .toSorted(
      (a, b) =>
        b.takeaway.createdAt.localeCompare(a.takeaway.createdAt) ||
        b.takeaway.id.localeCompare(a.takeaway.id),
    );
}

/** What waits in the queue on `today`: the Review tab's count (`countWaiting`). */
export async function reviewCount(today: string, db: LampDb = appDb): Promise<ReviewCount> {
  const [questions, items] = await Promise.all([
    db.question.where('status').equals('open').toArray(),
    db.memoryItem.toArray(),
  ]);
  const lessons = await liveLessons(
    questions.map((q) => q.lessonId),
    db,
  );
  return countWaiting({ questions, lessons: [...lessons.values()], items }, today);
}
