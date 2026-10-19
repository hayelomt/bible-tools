import { type HandoutSnapshot, isAppTranslation } from '@lamp/domain';
import { whenBook } from '@/data/bible.ts';
import { db as appDb, type LampDb } from '@/data/db.ts';
import { handoutOf } from './handout.ts';
import { lessonForExport } from './load.ts';

/**
 * A lesson's handout as its share link keeps it (M13-03): built here, since the main passages'
 * text comes from this device's Bible, and the server has none. Null when the lesson is gone.
 */
export async function handoutSnapshot(
  lessonId: string,
  db: LampDb = appDb,
): Promise<HandoutSnapshot | null> {
  const data = await lessonForExport(lessonId, db);
  if (!data) return null;
  const books = await Promise.all(
    data.lesson.mainPassages.map((ref) =>
      isAppTranslation(ref.translation) ? whenBook(ref.translation, ref.book) : null,
    ),
  );
  const { title, details, passages, notes, takeaways, questions, credit } = handoutOf(data, books);
  return {
    title,
    details,
    passages,
    notes,
    takeaways,
    questions: questions.map(({ text, status }) => ({ text, status })),
    credit,
  };
}
