import { isWholeBook, type Lesson, type Passage, type Series } from '@lamp/domain';
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
import { commentary, scopeTitle } from '@/search/compile.ts';
import {
  commentaryMarkdown,
  fileName,
  type LessonForExport,
  lessonMarkdown,
  seriesMarkdown,
} from './markdown.ts';

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

/** A series with its lessons' rows, for an export. */
export interface SeriesForExport {
  series: Series;
  /** In date order. */
  lessons: LessonForExport[];
}

/** A lesson and its rows, as the exports and the print view read them; null when it's gone. */
export async function lessonForExport(
  id: string,
  db: LampDb = appDb,
): Promise<LessonForExport | null> {
  const lesson = await lessonById(id, db);
  return lesson ? lessonData(lesson, db) : null;
}

/** A series and its lessons in date order, with their rows; null when it's gone. */
export async function seriesForExport(
  id: string,
  db: LampDb = appDb,
): Promise<SeriesForExport | null> {
  const series = await seriesById(id, db);
  if (!series) return null;
  const lessons = await seriesLessons(id, db);
  return { series, lessons: await Promise.all(lessons.map((lesson) => lessonData(lesson, db))) };
}

/** A lesson as Markdown, read from the device; null when it's gone. */
export async function exportLesson(id: string, db: LampDb = appDb): Promise<Exported | null> {
  const data = await lessonForExport(id, db);
  if (!data) return null;
  return {
    fileName: fileName(data.lesson.title, data.lesson.date),
    markdown: lessonMarkdown(data),
  };
}

/** A series and its lessons, in date order, as Markdown; null when it's gone. */
export async function exportSeries(id: string, db: LampDb = appDb): Promise<Exported | null> {
  const data = await seriesForExport(id, db);
  if (!data) return null;
  return {
    fileName: fileName(data.series.title),
    markdown: seriesMarkdown(data.series, data.lessons),
  };
}

/** The compile view of `scope` as Markdown (M10-04): "commentary-on-romans-8.md". */
export async function exportCommentary(scope: Passage, db: LampDb = appDb): Promise<Exported> {
  const title = scopeTitle(scope);
  return {
    fileName: fileName(`Commentary on ${title}`),
    markdown: commentaryMarkdown(title, await commentary(scope, db), isWholeBook(scope)),
  };
}
