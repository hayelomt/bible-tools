import {
  type Lesson,
  type Passage,
  passageRange,
  type Series,
  type Tag,
  toPlainText,
  type VerseRef,
  verseOrdinal,
} from '@lamp/domain';
import { addDays } from '@/lib/dates.ts';
import { commentary } from '@/search/compile.ts';
import { action } from '../action.ts';
import { db as appDb, type LampDb } from '../db.ts';
import { byDate, seriesLessons } from '../queries.ts';
import { questionViews } from '../question-status.ts';

/**
 * The prep card (F29, M11-09, wireframes/sermon.md "Prep card"): the coming sermon's passage, what
 * Lamp already has on it, and a draft lesson that capture mode opens. The draft isn't marked: it's
 * the nearest lesson dated today or later with a main passage and nothing written yet (decision
 * 87), so it syncs as any lesson does, and the card clears once the lesson has text or its day is
 * past.
 */

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;

/** The day of the coming sermon: today on a Sunday, else the next Sunday. */
export function sermonDay(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return addDays(day, (7 - weekday) % 7);
}

/** Nothing written: no section with text, no takeaway, no question. */
async function unwritten(lessonId: string, db: LampDb): Promise<boolean> {
  const [sections, takeaways, questions] = await Promise.all([
    db.section.where('lessonId').equals(lessonId).filter(live).toArray(),
    db.takeaway.where('lessonId').equals(lessonId).filter(live).count(),
    db.question.where('lessonId').equals(lessonId).filter(live).count(),
  ]);
  return takeaways === 0 && questions === 0 && sections.every((s) => !toPlainText(s.body).trim());
}

/** The prep's draft lesson on `day`, or null when there's none. */
export async function prepLesson(day: string, db: LampDb = appDb): Promise<Lesson | null> {
  const coming = (
    await db.lesson.filter((l) => live(l) && l.date >= day && l.mainPassages.length > 0).toArray()
  ).toSorted(byDate);
  for (const lesson of coming) if (await unwritten(lesson.id, db)) return lesson;
  return null;
}

/** An open question on the passage, for a link to its thread. */
export interface PrepQuestion {
  id: string;
  text: string;
}

/** What Lamp has on the prep's passage, from the device. */
export interface PrepSummary {
  lesson: Lesson;
  passage: VerseRef;
  /** The commentary's counts (M10-02). */
  sections: number;
  lessons: number;
  /** Open questions in the lessons on the passage: a section of theirs cites it, or it's theirs. */
  questions: PrepQuestion[];
  /** Tags on the sections that cite it, the most used first. */
  tags: Tag[];
  /** The lesson before this one in its series. */
  last: { lesson: Lesson; series: Series } | null;
}

/** How many tags the card shows. */
const TAGS = 6;

/** The prep on `day` with its summary, or null when there's no draft. */
export async function prepOf(day: string, db: LampDb = appDb): Promise<PrepSummary | null> {
  const lesson = await prepLesson(day, db);
  const passage = lesson?.mainPassages[0];
  if (!lesson || !passage) return null;
  const [notes, questions, last] = await Promise.all([
    commentary(passage, db),
    openQuestionsOn(passage, lesson.id, db),
    lastInSeries(lesson, db),
  ]);
  const sectionIds = [
    ...new Set(notes.groups.flatMap((g) => g.entries.map((e) => e.item.section.id))),
  ];
  return {
    lesson,
    passage,
    sections: notes.sections,
    lessons: notes.lessons,
    questions,
    tags: await tagsOn(sectionIds, db),
    last,
  };
}

/** The ids of the lessons with a section or a main passage overlapping `scope`, but `except`. */
async function lessonsOn(scope: Passage, except: string, db: LampDb): Promise<string[]> {
  const [start, end] = passageRange(scope);
  const citations = (
    await db.citation
      .where('startOrd')
      .between(verseOrdinal(scope.book, 0, 0), end, true, true)
      .toArray()
  ).filter((c) => c.endOrd >= start);
  const ofSections = await db.section.bulkGet(
    citations.filter((c) => c.sourceType === 'section').map((c) => c.sourceId),
  );
  const ids = new Set([
    ...citations.filter((c) => c.sourceType === 'lesson').map((c) => c.sourceId),
    ...ofSections.filter(live).map((s) => s.lessonId),
  ]);
  ids.delete(except);
  const lessons = await db.lesson.bulkGet([...ids]);
  return lessons.filter(live).map((l) => l.id);
}

async function openQuestionsOn(
  scope: Passage,
  except: string,
  db: LampDb,
): Promise<PrepQuestion[]> {
  const lessonIds = await lessonsOn(scope, except, db);
  const questions = (await db.question.where('lessonId').anyOf(lessonIds).toArray())
    .filter(live)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return (await questionViews(questions, db))
    .filter((q) => q.status === 'open')
    .map(({ id, text }) => ({ id, text }));
}

async function tagsOn(sectionIds: readonly string[], db: LampDb): Promise<Tag[]> {
  const uses = new Map<string, number>();
  for (const link of await db.sectionTag.where('sectionId').anyOf(sectionIds).toArray()) {
    if (link.deletedAt === null) uses.set(link.tagId, (uses.get(link.tagId) ?? 0) + 1);
  }
  const tags = (await db.tag.bulkGet([...uses.keys()])).filter(live);
  return tags
    .toSorted((a, b) => uses.get(b.id)! - uses.get(a.id)! || a.name.localeCompare(b.name))
    .slice(0, TAGS);
}

async function lastInSeries(
  lesson: Lesson,
  db: LampDb,
): Promise<{ lesson: Lesson; series: Series } | null> {
  if (!lesson.seriesId) return null;
  const series = await db.series.get(lesson.seriesId);
  if (!live(series)) return null;
  const before = (await seriesLessons(series.id, db)).filter((l) => byDate(l, lesson) < 0);
  const last = before.at(-1);
  return last ? { lesson: last, series } : null;
}

/** The series of the latest sermon, which the next one most likely continues. */
async function lastSeriesUsed(db: LampDb): Promise<string | null> {
  const sermons = (
    await db.lesson.filter((l) => live(l) && l.kind === 'sermon').toArray()
  ).toSorted(byDate);
  const seriesId = sermons.at(-1)?.seriesId;
  return seriesId && live(await db.series.get(seriesId)) ? seriesId : null;
}

/**
 * The draft lesson for a passage: titled by it, with it as its main passage, dated on the sermon's
 * day, a sermon in the last series used. Without the kind's default template, so capture mode can
 * edit every section and the card stays until something is written.
 */
export function startPrep(passage: VerseRef, day: string, db: LampDb = appDb): Promise<Lesson> {
  return action(db, async (w) =>
    w.create('lesson', {
      seriesId: await lastSeriesUsed(w.db),
      title: passage.display,
      date: sermonDay(day),
      kind: 'sermon',
      speaker: null,
      church: null,
      sourceType: null,
      sourceTitle: null,
      sourceAuthor: null,
      sourceUrl: null,
      sourceStartedAt: null,
      mainPassages: [passage],
    }),
  );
}

/** What ✕ deleted, for its Undo. */
export interface ClearedPrep {
  lessonId: string;
  rows: (readonly ['section' | 'sectionTag' | 'lessonTag', string])[];
}

/** ✕: deletes the draft, which has nothing written, with its empty sections and its tags. */
export function clearPrep(lessonId: string, db: LampDb = appDb): Promise<ClearedPrep> {
  return action(db, async (w) => {
    const sections = (await w.db.section.where('lessonId').equals(lessonId).toArray()).filter(live);
    const sectionTags = (
      await w.db.sectionTag
        .where('sectionId')
        .anyOf(sections.map((s) => s.id))
        .toArray()
    ).filter(live);
    const lessonTags = (await w.db.lessonTag.where('lessonId').equals(lessonId).toArray()).filter(
      live,
    );
    for (const t of sectionTags) await w.remove('sectionTag', t.id);
    for (const s of sections) await w.remove('section', s.id);
    for (const t of lessonTags) await w.remove('lessonTag', t.id);
    await w.remove('lesson', lessonId);
    return {
      lessonId,
      rows: [
        ...sections.map((s) => ['section', s.id] as const),
        ...sectionTags.map((t) => ['sectionTag', t.id] as const),
        ...lessonTags.map((t) => ['lessonTag', t.id] as const),
      ],
    };
  });
}

/** Undo of ✕: the lesson first, then what was in it. */
export function restorePrep(cleared: ClearedPrep, db: LampDb = appDb): Promise<void> {
  return action(db, async (w) => {
    await w.restore('lesson', cleared.lessonId);
    for (const [entity, id] of cleared.rows) await w.restore(entity, id);
  });
}
