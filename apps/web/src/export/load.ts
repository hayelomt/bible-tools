import type { Lesson } from '@lamp/domain';
import { db as appDb, type LampDb } from '@/data/db.ts';
import {
  lessonById,
  lessonQuestions,
  lessonSections,
  lessonTakeaways,
  seriesById,
  seriesLessons,
  tagsOf,
} from '@/data/queries.ts';
import { fileName, type LessonForExport, lessonMarkdown, seriesMarkdown } from './markdown.ts';

/** A finished export: what to call the file, and what's in it. */
export interface Exported {
  fileName: string;
  markdown: string;
}

async function lessonData(lesson: Lesson, db: LampDb): Promise<LessonForExport> {
  const [sections, tags, takeaways, questions] = await Promise.all([
    lessonSections(lesson.id, db),
    tagsOf({ kind: 'lesson', id: lesson.id }, db),
    lessonTakeaways(lesson.id, db),
    lessonQuestions(lesson.id, db),
  ]);
  const sectionTags = new Map(
    await Promise.all(
      sections.map(
        async (s) =>
          [s.id, (await tagsOf({ kind: 'section', id: s.id }, db)).map((t) => t.tag.name)] as const,
      ),
    ),
  );
  return {
    lesson,
    sections,
    sectionTags,
    tags: tags.map((t) => t.tag.name),
    takeaways,
    questions,
  };
}

/** A lesson as Markdown, read from the device; null when it's gone. */
export async function exportLesson(id: string, db: LampDb = appDb): Promise<Exported | null> {
  const lesson = await lessonById(id, db);
  if (!lesson) return null;
  return {
    fileName: fileName(lesson.title, lesson.date),
    markdown: lessonMarkdown(await lessonData(lesson, db)),
  };
}

/** A series and its lessons, in date order, as Markdown; null when it's gone. */
export async function exportSeries(id: string, db: LampDb = appDb): Promise<Exported | null> {
  const series = await seriesById(id, db);
  if (!series) return null;
  const lessons = await seriesLessons(id, db);
  return {
    fileName: fileName(series.title),
    markdown: seriesMarkdown(
      series,
      await Promise.all(lessons.map((lesson) => lessonData(lesson, db))),
    ),
  };
}
