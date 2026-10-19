import {
  dueDate,
  formatPassage,
  passageSlug,
  type Grown,
  grewMost,
  type InlineNode,
  type Lesson,
  type Citation,
  type LessonTag,
  type Question,
  type Section,
  type SectionTag,
  type Quarter,
  quarterDays,
  quarterLabel,
  type SectionBody,
  type Series,
} from '@lamp/domain';
import { addDays, dayAndMonth, today as todayOn } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import { db as appDb, type LampDb } from './db.ts';
import { eachByIndex } from './idb.ts';
import { viewOf } from './question-status.ts';

/**
 * The quarterly digest (F32, M12-07, wireframes/reflection.md "Quarterly digest"): what a quarter
 * held, read from the device, and written as the draft's sections. A quarter's lessons are those
 * dated in it; what's counted with them is theirs (tags, open questions, the commentaries' new
 * sections). Answers and memory verses count by when they happened.
 */

/** How many tags "Top tags" names. */
export const TOP_TAGS = 5;

export interface Digest {
  quarter: Quarter;
  /** "July–September 2026": the draft's title. */
  title: string;
  /** The live lessons dated in the quarter, in date order. */
  lessons: Lesson[];
  /** How many of them each series has, most first; `series` null for those in none, last. */
  bySeries: { series: Series | null; lessons: number }[];
  /** The tags most used in them, as the tag page counts (sections and whole lessons). */
  topTags: { name: string; count: number }[];
  /** Questions answered in the quarter that are answered still. */
  answered: number;
  /** Their questions that are open now, in lesson order. */
  open: { question: Question; lesson: Lesson }[];
  /** Memory verses added in the quarter, and those last reviewed in it (decided in M12-07). */
  memory: { added: number; reviewed: number };
  /** The chapters whose commentaries gained the most sections from them. */
  grew: Grown[];
}

const live = <T extends { deletedAt: string | null }>(row: T | undefined): row is T =>
  !!row && row.deletedAt === null;
const isLive = (row: { deletedAt: string | null }) => row.deletedAt === null;

/** The local day of a time, as the device saw it. */
const dayOf = (iso: string) => todayOn(new Date(iso));

/**
 * The quarter's digest; null for a quarter with no lessons, which gets none. Read for two years
 * of notes within the lesson-open budget (M12-11, `digest.spec.ts`): whole tables with `getAll`,
 * filtered here, where every row is needed, and the quarter's own sections, tags and citations
 * lesson by lesson through their indexes, in one transaction each (`eachByIndex`).
 */
export async function digestFor(quarter: Quarter, db: LampDb = appDb): Promise<Digest | null> {
  const [first, last] = quarterDays(quarter);
  const within = (day: string) => day >= first && day <= last;
  const allLessons = new Map(
    (await db.lesson.toArray()).filter(isLive).map((l) => [l.id, l] as const),
  );
  const lessons = [...allLessons.values()]
    .filter((l) => within(l.date))
    .toSorted((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  if (lessons.length === 0) return null;
  const lessonIds = new Set(lessons.map((l) => l.id));

  const seriesIds = [...new Set(lessons.flatMap((l) => (l.seriesId ? [l.seriesId] : [])))];
  const series = new Map(
    (await db.series.bulkGet(seriesIds)).filter(live).map((s) => [s.id, s] as const),
  );
  const perSeries = new Map<string | null, number>();
  for (const lesson of lessons) {
    const key = lesson.seriesId && series.has(lesson.seriesId) ? lesson.seriesId : null;
    perSeries.set(key, (perSeries.get(key) ?? 0) + 1);
  }
  const bySeries = [...perSeries]
    .map(([id, n]) => ({ series: id ? series.get(id)! : null, lessons: n }))
    .toSorted(
      (a, b) =>
        Number(a.series === null) - Number(b.series === null) ||
        b.lessons - a.lessons ||
        (a.series?.title ?? '').localeCompare(b.series?.title ?? ''),
    );

  // The quarter's lessons, each with its sections, section tags, lesson tags and citations.
  const ids = lessons.map((l) => l.id);
  const [sectionLists, lessonTagLists, citationLists] = await Promise.all([
    eachByIndex<Section>(db, 'section', 'lessonId', ids),
    eachByIndex<LessonTag>(db, 'lessonTag', 'lessonId', ids),
    eachByIndex<Citation>(db, 'citation', 'lessonId', ids),
  ]);
  const liveSections = sectionLists.flat().filter(isLive);
  const sectionTags = (
    await eachByIndex<SectionTag>(
      db,
      'sectionTag',
      'sectionId',
      liveSections.map((s) => s.id),
    )
  ).flat();

  // As the tag page counts: a tagged section, or a lesson tagged as a whole.
  const tagCounts = new Map<string, number>();
  for (const link of [...sectionTags, ...lessonTagLists.flat()]) {
    if (isLive(link)) tagCounts.set(link.tagId, (tagCounts.get(link.tagId) ?? 0) + 1);
  }
  const tags = (await db.tag.bulkGet([...tagCounts.keys()])).filter(live);
  const topTags = tags
    .map((tag) => ({ name: tag.name, count: tagCounts.get(tag.id)! }))
    .toSorted((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, TOP_TAGS);

  const [questionRows, entries] = await Promise.all([
    db.question.toArray(),
    db.questionEntry.toArray(),
  ]);
  const answerIds = [...new Set(entries.flatMap((e) => (e.sectionId ? [e.sectionId] : [])))];
  const answerSections = new Map(
    (await db.section.bulkGet(answerIds)).filter(live).map((s) => [s.id, s] as const),
  );
  const status = { entries, sections: answerSections };
  const questions = questionRows
    .filter((q) => isLive(q) && allLessons.has(q.lessonId))
    .map((q) => viewOf(q, status));
  const answered = questions.filter((q) => {
    if (q.status !== 'answered') return false;
    const answer = q.entries.findLast((e) => e.kind === 'answered');
    return !!answer && within(dayOf(answer.createdAt));
  }).length;
  const order = new Map(lessons.map((l, i) => [l.id, i]));
  const open = questions
    .filter((q) => q.status === 'open' && lessonIds.has(q.lessonId))
    .toSorted(
      (a, b) =>
        order.get(a.lessonId)! - order.get(b.lessonId)! || a.createdAt.localeCompare(b.createdAt),
    )
    .map(({ status: _s, partial: _p, answerSectionId: _a, entries: _e, ...question }) => ({
      question,
      lesson: allLessons.get(question.lessonId)!,
    }));

  const memory = { added: 0, reviewed: 0 };
  for (const item of (await db.memoryItem.toArray()).filter(isLive)) {
    if (within(dayOf(item.createdAt))) memory.added++;
    // The latest review was `interval` days before the next one is due.
    if (item.reviewCount > 0 && within(addDays(dueDate(item), -item.interval))) memory.reviewed++;
  }

  const sections = new Set(liveSections.map((s) => s.id));
  const citations = citationLists
    .flat()
    .filter((c) => c.sourceType === 'section' && sections.has(c.sourceId));

  return {
    quarter,
    title: quarterLabel(quarter),
    lessons,
    bySeries,
    topTags,
    answered,
    open,
    memory,
    grew: grewMost(citations),
  };
}

const text = (value: string): InlineNode => ({ type: 'text', text: value });
const heading = (value: string) => ({
  type: 'heading' as const,
  attrs: { level: 3 as const },
  content: [text(value)],
});
const paragraph = (...content: InlineNode[]) => ({ type: 'paragraph' as const, content });
const bullets = (items: InlineNode[][]) => ({
  type: 'bulletList' as const,
  content: items.map((content) => ({
    type: 'listItem' as const,
    content: [paragraph(...content)] as [ReturnType<typeof paragraph>],
  })),
});
const doc = (...content: SectionBody['content']): SectionBody => ({ type: 'doc', content });
const lessonChip = (lesson: Lesson): InlineNode => ({
  type: 'noteLink',
  attrs: { targetType: 'lesson', targetId: lesson.id, label: lesson.title },
});

/** "11 lessons: 8 in John, 3 on their own."; "3 lessons." when none is in a series. */
function lessonsLine({ lessons, bySeries }: Digest): string {
  const total = count(lessons.length, 'lesson');
  if (bySeries.every((s) => s.series === null)) return `${total}.`;
  const parts = bySeries.map(({ series, lessons: n }) =>
    series ? `${n} in ${series.title}` : `${n} on ${n === 1 ? 'its' : 'their'} own`,
  );
  return `${total}: ${parts.join(', ')}.`;
}

/**
 * The digest as the draft's sections, each under its heading: lesson titles as link chips, and
 * the chapters that grew as links to their commentaries (decided in M12-11: a chapter chip would
 * preview the whole chapter), so each opens what it names. Ordinary text to edit. Without an
 * `origin` (outside a browser) the chapters are plain text.
 */
export function digestSections(
  digest: Digest,
  origin: string | undefined = globalThis.location?.origin,
): SectionBody[] {
  const { memory } = digest;
  const grew = digest.grew.flatMap(({ passage, sections }, i): InlineNode[] => {
    const name = formatPassage(passage);
    return [
      ...(i > 0 ? [text(' · ')] : []),
      origin
        ? {
            type: 'text',
            text: name,
            marks: [{ type: 'link', attrs: { href: `${origin}/compile/${passageSlug(passage)}` } }],
          }
        : text(name),
      text(` (+${sections})`),
    ];
  });
  return [
    doc(
      heading('Lessons and series'),
      paragraph(text(lessonsLine(digest))),
      bullets(
        digest.lessons.map((lesson) => [
          text(`${dayAndMonth(lesson.date)} · `),
          lessonChip(lesson),
        ]),
      ),
    ),
    doc(
      heading('Top tags'),
      paragraph(
        text(
          digest.topTags.length > 0
            ? digest.topTags.map((t) => `#${t.name} ${t.count}`).join(' · ')
            : 'No tags.',
        ),
      ),
    ),
    doc(
      heading('Questions'),
      paragraph(text(`${digest.answered} answered, ${digest.open.length} still open.`)),
      ...(digest.open.length > 0
        ? [
            bullets(
              digest.open.map(({ question, lesson }) => [
                text(`${question.text} · `),
                lessonChip(lesson),
              ]),
            ),
          ]
        : []),
    ),
    doc(
      heading('Memory verses'),
      paragraph(
        text(
          memory.added + memory.reviewed > 0
            ? `${memory.added} added, ${memory.reviewed} reviewed.`
            : 'None added or reviewed.',
        ),
      ),
    ),
    doc(
      heading('Commentaries that grew'),
      paragraph(...(grew.length > 0 ? grew : [text('No verses cited.')])),
    ),
  ];
}
