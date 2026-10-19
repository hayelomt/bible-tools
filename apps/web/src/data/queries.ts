import {
  compareOrder,
  type Lesson,
  type Question,
  type Section,
  type Series,
  type Tag,
  type Takeaway,
  type Template,
} from '@lamp/domain';
import { liveLinksOf, TAG_LINKS, type TagLink, type TagTarget } from './actions/tags.ts';
import { db as appDb, type LampDb } from './db.ts';
import { type QuestionView, questionViews } from './question-status.ts';

/**
 * Reads for the lesson and series screens, used through `useLiveQuery`. Tombstones are filtered
 * here, so screens never see a deleted row.
 */

const notDeleted = (row: { deletedAt: string | null }) => row.deletedAt === null;

/** A lesson's question: its own, or one revisited in it (F24), shown with ↻. */
export interface LessonQuestion extends QuestionView {
  revisited: boolean;
  /** The lesson its answer section is in, which may be another one it was revisited in. */
  answerLessonId: string | null;
}

/**
 * Lessons by date, oldest first; lessons on the same day in the order they were made (UUIDv7 ids
 * sort by creation time, so they also break a tie within one millisecond).
 */
export const byDate = (a: Lesson, b: Lesson) =>
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

/**
 * The user's lessons to list: live, and not their own lesson for a group lesson of a group they're
 * in, which opens from the group (§17.12). Once the group is gone it's an ordinary lesson.
 */
async function listedLessons(db: LampDb): Promise<Lesson[]> {
  const [lessons, groupLessons] = await Promise.all([
    db.lesson.filter(notDeleted).toArray(),
    db.groupLesson.toCollection().primaryKeys(),
  ]);
  const inGroups = new Set(groupLessons);
  return lessons.filter((l) => l.groupLessonId === null || !inGroups.has(l.groupLessonId));
}

/** Every lesson, newest first. */
export async function allLessons(db: LampDb = appDb): Promise<Lesson[]> {
  const lessons = await listedLessons(db);
  return lessons.toSorted(byDate).toReversed();
}

export function lessonCount(db: LampDb = appDb): Promise<number> {
  return db.lesson.filter(notDeleted).count();
}

/** A series' lessons in date order, oldest first (wireframes/lessons.md "Series"). */
export async function seriesLessons(seriesId: string, db: LampDb = appDb): Promise<Lesson[]> {
  const lessons = await db.lesson.where('seriesId').equals(seriesId).filter(notDeleted).toArray();
  return lessons.toSorted(byDate);
}

export interface SeriesSummary extends Series {
  lessonCount: number;
}

/** Every series by title, with how many lessons it holds. */
export async function allSeries(db: LampDb = appDb): Promise<SeriesSummary[]> {
  const [series, lessons] = await Promise.all([
    db.series.filter(notDeleted).toArray(),
    db.lesson.filter(notDeleted).toArray(),
  ]);
  return summarise(series, lessons);
}

/**
 * Every lesson (newest first) and every series (as `allSeries`), reading the lessons once: for
 * a screen that shows both, like the lessons home.
 */
export async function lessonsAndSeries(
  db: LampDb = appDb,
): Promise<{ lessons: Lesson[]; series: SeriesSummary[] }> {
  const [series, lessons] = await Promise.all([
    db.series.filter(notDeleted).toArray(),
    listedLessons(db),
  ]);
  return {
    lessons: lessons.toSorted(byDate).toReversed(),
    series: summarise(series, lessons),
  };
}

function summarise(series: Series[], lessons: Lesson[]): SeriesSummary[] {
  const counts = new Map<string, number>();
  for (const { seriesId } of lessons) {
    if (seriesId) counts.set(seriesId, (counts.get(seriesId) ?? 0) + 1);
  }
  return series
    .map((s) => ({ ...s, lessonCount: counts.get(s.id) ?? 0 }))
    .toSorted((a, b) => a.title.localeCompare(b.title));
}

/**
 * One lesson or series by id: `null` when it doesn't exist or was deleted, so a screen can tell
 * "missing" from `useLiveQuery`'s `undefined` (not read yet).
 */
export async function lessonById(id: string, db: LampDb = appDb): Promise<Lesson | null> {
  const row = await db.lesson.get(id);
  return row && notDeleted(row) ? row : null;
}

export async function seriesById(id: string, db: LampDb = appDb): Promise<Series | null> {
  const row = await db.series.get(id);
  return row && notDeleted(row) ? row : null;
}

/** A lesson's sections, in no particular order (`outline` puts them in order). */
export function lessonSections(lessonId: string, db: LampDb = appDb): Promise<Section[]> {
  return db.section.where('lessonId').equals(lessonId).filter(notDeleted).toArray();
}

/** How many sections a lesson has, for the delete confirmation. */
/** How many conflicted copies (§6.4) each lesson has, for its row in a list. */
export async function conflictCounts(db: LampDb = appDb): Promise<Map<string, number>> {
  // IndexedDB doesn't index null, so only the copies are in the `conflictOf` index.
  const copies = await db.section
    .orderBy('conflictOf')
    .filter((s) => s.deletedAt === null)
    .toArray();
  const counts = new Map<string, number>();
  for (const copy of copies) counts.set(copy.lessonId, (counts.get(copy.lessonId) ?? 0) + 1);
  return counts;
}

export function sectionCount(lessonId: string, db: LampDb = appDb): Promise<number> {
  return db.section.where('lessonId').equals(lessonId).filter(notDeleted).count();
}

/** Every tag, seeded and custom, by name ignoring case. */
export async function allTags(db: LampDb = appDb): Promise<Tag[]> {
  const tags = await db.tag.filter(notDeleted).toArray();
  return tags.toSorted((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

/** A tag on a section or lesson, with the link that puts it there. */
export interface AppliedTag {
  tag: Tag;
  link: TagLink;
}

/** The tags on a section or lesson, in the order they were added. */
export async function tagsOf(target: TagTarget, db: LampDb = appDb): Promise<AppliedTag[]> {
  const links = await liveLinksOf(db, target).toArray();
  const { entity } = TAG_LINKS[target.kind];
  const tags = await db.tag.bulkGet(links.map((l) => l.tagId));
  return links
    .map((link, i) => ({ link, tag: tags[i] }))
    .filter((t): t is { link: (typeof links)[number]; tag: Tag } => !!t.tag && notDeleted(t.tag))
    .toSorted(
      (a, b) =>
        a.link.createdAt.localeCompare(b.link.createdAt) || a.link.id.localeCompare(b.link.id),
    )
    .map(({ link, tag }) => ({ tag, link: { entity, id: link.id } }));
}

/** A tag by id: `null` when it doesn't exist or was deleted. */
export async function tagById(id: string, db: LampDb = appDb): Promise<Tag | null> {
  const row = await db.tag.get(id);
  return row && notDeleted(row) ? row : null;
}

/** A lesson on a tag page: the lesson itself if it has the tag, and its sections that do. */
export interface TaggedLesson {
  lesson: Lesson;
  lessonTagged: boolean;
  /** In reading order: a section, then its replies. */
  sections: Section[];
}

/**
 * Everything with a tag (F4, wireframes/lessons.md "Tag page"), grouped by lesson, newest lesson
 * first.
 */
export async function taggedWith(tagId: string, db: LampDb = appDb): Promise<TaggedLesson[]> {
  const [sectionLinks, lessonLinks] = await Promise.all([
    db.sectionTag.where('tagId').equals(tagId).filter(notDeleted).toArray(),
    db.lessonTag.where('tagId').equals(tagId).filter(notDeleted).toArray(),
  ]);
  const sections = (await db.section.bulkGet(sectionLinks.map((l) => l.sectionId))).filter(
    (s): s is Section => !!s && notDeleted(s),
  );
  const lessonIds = new Set([
    ...lessonLinks.map((l) => l.lessonId),
    ...sections.map((s) => s.lessonId),
  ]);
  const lessons = (await db.lesson.bulkGet([...lessonIds])).filter(
    (l): l is Lesson => !!l && notDeleted(l),
  );
  const tagged = new Set(lessonLinks.map((l) => l.lessonId));

  return Promise.all(
    lessons
      .toSorted(byDate)
      .toReversed()
      .map(async (lesson) => {
        const own = sections.filter((s) => s.lessonId === lesson.id);
        const parents = own.some((s) => s.parentId) ? await lessonSections(lesson.id, db) : own;
        return {
          lesson,
          lessonTagged: tagged.has(lesson.id),
          sections: readingOrder(own, parents),
        };
      }),
  );
}

/**
 * Sections in the order the lesson shows them: by their top-level section, which comes before
 * its replies. `all` holds the parents of any replies among `sections`.
 */
export function readingOrder(sections: Section[], all: Section[]): Section[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const top = (s: Section) => (s.parentId && byId.get(s.parentId)) || s;
  return sections.toSorted(
    (a, b) =>
      compareOrder(top(a), top(b)) ||
      Number(top(a) !== a) - Number(top(b) !== b) ||
      compareOrder(a, b),
  );
}

/** In the order they were added; the list adds at the end. */
const byCreation = (a: { createdAt: string; id: string }, b: { createdAt: string; id: string }) =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

/** A lesson's takeaways (F5), oldest first. */
export async function lessonTakeaways(lessonId: string, db: LampDb = appDb): Promise<Takeaway[]> {
  const rows = await db.takeaway.where('lessonId').equals(lessonId).filter(notDeleted).toArray();
  return rows.toSorted(byCreation);
}

/**
 * A lesson's questions (F5), with their status (F24): its own, and those revisited in it, in the
 * order they came to it.
 */
export async function lessonQuestions(
  lessonId: string,
  db: LampDb = appDb,
): Promise<LessonQuestion[]> {
  const own = await db.question.where('lessonId').equals(lessonId).filter(notDeleted).toArray();
  // Questions revisited here (F24): their entries made in this lesson, and when it came here.
  const here = await db.questionEntry
    .where('lessonId')
    .equals(lessonId)
    .filter(notDeleted)
    .toArray();
  const arrived = new Map<string, string>();
  for (const entry of here) {
    const at = arrived.get(entry.questionId);
    if (at === undefined || entry.createdAt < at) arrived.set(entry.questionId, entry.createdAt);
  }
  const ownIds = new Set(own.map((q) => q.id));
  const visiting = (
    await db.question.bulkGet([...arrived.keys()].filter((id) => !ownIds.has(id)))
  ).filter((q): q is Question => !!q && q.deletedAt === null);
  const views = await questionViews([...own, ...visiting], db);
  const answers = await db.section.bulkGet(views.flatMap((v) => v.answerSectionId ?? []));
  const answerLesson = new Map(answers.flatMap((s) => (s ? [[s.id, s.lessonId]] : [])));
  const since = (q: Question) => (ownIds.has(q.id) ? q.createdAt : arrived.get(q.id)!);
  return views
    .map((view) => ({
      ...view,
      revisited: !ownIds.has(view.id),
      answerLessonId: view.answerSectionId
        ? (answerLesson.get(view.answerSectionId) ?? null)
        : null,
    }))
    .toSorted((a, b) => since(a).localeCompare(since(b)) || a.id.localeCompare(b.id));
}

/** The user's own templates (M10-13), by name. */
export async function allTemplates(db: LampDb = appDb): Promise<Template[]> {
  const templates = await db.template.filter((t) => t.deletedAt === null).toArray();
  return templates.toSorted((a, b) => a.name.localeCompare(b.name));
}
