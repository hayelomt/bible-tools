import { daysBetween, type Lesson, type Takeaway } from '@lamp/domain';
import { today as todayOn } from '@/lib/dates.ts';
import { db as appDb, type LampDb, SETTINGS_KEY } from './db.ts';
import { type QuestionView, statusRows, viewOf } from './question-status.ts';
import { countWaiting, type ReviewCount } from './review-count.ts';

/**
 * The review queue's reads (F9, TECH-DESIGN §8.8): open questions, recent takeaways, and the count
 * the Review tab shows. Local queries, like the rest; a deleted lesson takes its rows with it.
 */

export interface QuestionInQueue {
  question: QuestionView;
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
  const questions = await db.question.filter((q) => q.deletedAt === null).toArray();
  const lessons = await liveLessons(
    questions.map((q) => q.lessonId),
    db,
  );
  const mine = questions.filter((q) => lessons.has(q.lessonId));
  const status = await statusRows(
    mine.map((q) => q.id),
    db,
  );
  return mine
    .flatMap((row) => {
      const question = viewOf(row, status);
      return question.status === 'open' ? [{ question, lesson: lessons.get(row.lessonId)! }] : [];
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
  const [questions, items, dismissals, settings] = await Promise.all([
    db.question.filter((q) => q.deletedAt === null).toArray(),
    db.memoryItem.toArray(),
    db.resurfaceDismissal.toArray(),
    db.userSettings.get(SETTINGS_KEY),
  ]);
  const lessons = await liveLessons(
    questions.map((q) => q.lessonId),
    db,
  );
  const status = await statusRows(
    questions.map((q) => q.id),
    db,
  );
  return countWaiting(
    {
      questions,
      lessons: [...lessons.values()],
      items,
      dismissals,
      resurfacing: settings?.resurfacing,
      ...status,
    },
    today,
  );
}
