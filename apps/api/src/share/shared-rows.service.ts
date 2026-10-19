import {
  citedRefs,
  compareOrder,
  compile,
  type EntityRow,
  formatPassage,
  getBook,
  isWholeBook,
  type Lesson,
  type Passage,
  passageRange,
  questionStatus,
  type Section,
  type SectionBody,
  type Series,
  threadOf,
  toPlainText,
  TRANSLATIONS,
  type TranslationId,
  DEFAULT_TRANSLATION,
} from '@lamp/domain';
import { Injectable } from '@nestjs/common';
// Value imports, not `import type`: Nest resolves the constructor parameters from their classes.
import { PrismaService } from '../prisma/prisma.service.js';
import { type RowEntity, toRow } from '../sync/entity-tables.js';
import type { CommentaryView, LessonView, SeriesView } from './views.js';

/**
 * The owner's rows a shared page shows (F34, M13-02), read as the device has them. Every query
 * names the link's owner, so a page can only ever show that account's live rows, and only those
 * its target covers: the lesson, the series' lessons, or the sections citing the passage.
 */
@Injectable()
export class SharedRowsService {
  constructor(private readonly prisma: PrismaService) {}

  /** The translation the owner picked in Settings, which the pages quote (decision 97). */
  async translation(userId: string): Promise<TranslationId> {
    const settings = await this.prisma.userSettings.findUnique({
      where: { userId },
      select: { defaultTranslation: true },
    });
    const picked = settings?.defaultTranslation;
    return (TRANSLATIONS as readonly string[]).includes(picked ?? '')
      ? (picked as TranslationId)
      : DEFAULT_TRANSLATION;
  }

  /** A live lesson of the owner's; null when it's gone. */
  async lesson(userId: string, id: string): Promise<Lesson | null> {
    const row = await this.prisma.lesson.findFirst({ where: { id, userId, deletedAt: null } });
    return row ? rowOf('lesson', row) : null;
  }

  async series(userId: string, id: string): Promise<Series | null> {
    const row = await this.prisma.series.findFirst({ where: { id, userId, deletedAt: null } });
    return row ? rowOf('series', row) : null;
  }

  /** A series and its live lessons in date order; null when it's gone. */
  async seriesView(userId: string, id: string): Promise<SeriesView | null> {
    const series = await this.series(userId, id);
    if (!series) return null;
    const rows = await this.prisma.lesson.findMany({
      where: { userId, seriesId: id, deletedAt: null },
    });
    return { series, lessons: rows.map((r) => rowOf('lesson', r)).toSorted(byDate) };
  }

  /** The live sections of these lessons, with their lesson, for link chips to them. */
  sectionLessons(userId: string, lessonIds: string[]): Promise<{ id: string; lessonId: string }[]> {
    return this.prisma.section.findMany({
      where: { userId, lessonId: { in: lessonIds }, deletedAt: null },
      select: { id: true, lessonId: true },
    });
  }

  /** A lesson with everything its page shows. */
  async lessonView(userId: string, lesson: Lesson): Promise<LessonView> {
    const lessonId = lesson.id;
    const [sectionRows, lessonTags, takeaways, ownQuestions, entriesHere] = await Promise.all([
      this.prisma.section.findMany({ where: { userId, lessonId, deletedAt: null } }),
      this.prisma.lessonTag.findMany({
        where: { userId, lessonId, deletedAt: null, tag: { deletedAt: null } },
        include: { tag: true },
      }),
      this.prisma.takeaway.findMany({
        where: { userId, lessonId, deletedAt: null },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
      this.prisma.question.findMany({ where: { userId, lessonId, deletedAt: null } }),
      this.prisma.questionEntry.findMany({ where: { userId, lessonId, deletedAt: null } }),
    ]);
    const sections = sectionRows.map((r) => rowOf('section', r));
    const sectionTags = await this.prisma.sectionTag.findMany({
      where: {
        userId,
        sectionId: { in: sections.map((s) => s.id) },
        deletedAt: null,
        tag: { deletedAt: null },
      },
      include: { tag: true },
      orderBy: { createdAt: 'asc' },
    });
    const tagsBySection = new Map<string, string[]>();
    for (const { sectionId, tag } of sectionTags) {
      tagsBySection.set(sectionId, [...(tagsBySection.get(sectionId) ?? []), tag.name]);
    }

    // Its own questions, and those revisited in it (F24), in the order they came to it.
    const own = new Set(ownQuestions.map((q) => q.id));
    const firstHere = new Map<string, Date>();
    for (const entry of entriesHere) {
      if (own.has(entry.questionId)) continue;
      const seen = firstHere.get(entry.questionId);
      if (!seen || entry.createdAt < seen) firstHere.set(entry.questionId, entry.createdAt);
    }
    const revisited = await this.prisma.question.findMany({
      where: { userId, id: { in: [...firstHere.keys()] }, deletedAt: null },
    });
    const questions = [
      ...ownQuestions.map((q) => ({ question: q, at: q.createdAt })),
      ...revisited.map((q) => ({ question: q, at: firstHere.get(q.id)! })),
    ].toSorted(
      (a, b) => a.at.getTime() - b.at.getTime() || a.question.id.localeCompare(b.question.id),
    );

    return {
      lesson,
      rows: outline(sections),
      sectionTags: tagsBySection,
      tags: lessonTags
        .toSorted((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((t) => t.tag.name),
      takeaways: takeaways.map((t) => t.text),
      questions: await this.withStatus(
        userId,
        questions.map((q) => q.question),
      ),
    };
  }

  /** Questions' text and status, from their entries (§17.5). */
  private async withStatus(
    userId: string,
    questions: readonly { id: string; text: string }[],
  ): Promise<LessonView['questions']> {
    const entries = (
      await this.prisma.questionEntry.findMany({
        where: { userId, questionId: { in: questions.map((q) => q.id) } },
      })
    ).map((e) => rowOf('questionEntry', e));
    const answerIds = entries.flatMap((e) => (e.sectionId ? [e.sectionId] : []));
    const answers = new Map(
      (
        await this.prisma.section.findMany({
          where: { userId, id: { in: answerIds }, deletedAt: null },
          select: { id: true, body: true },
        })
      ).map((s) => [s.id, s.body as unknown as SectionBody]),
    );
    return questions.map((q) => ({
      text: q.text,
      status: questionStatus(
        threadOf(entries.filter((e) => e.questionId === q.id)),
        (id) => answers.has(id) && hasAnswer(answers.get(id)!),
      ),
    }));
  }

  /**
   * The compile view of `scope` (F22), as the app's `commentary` works it out: every live section
   * citing a passage that overlaps it, grouped by the passage cited, by lesson date and then the
   * lesson's reading order; one citing several is shown once, with pointers (M10-03).
   */
  async commentary(userId: string, scope: Passage): Promise<CommentaryView> {
    const [start, end] = passageRange(scope);
    const citations = await this.prisma.citation.findMany({
      where: {
        userId,
        sourceType: 'section',
        book: scope.book,
        startOrd: { lte: end },
        endOrd: { gte: start },
      },
      select: { sourceId: true },
    });
    const sections = (
      await this.prisma.section.findMany({
        where: {
          userId,
          id: { in: [...new Set(citations.map((c) => c.sourceId))] },
          deletedAt: null,
        },
      })
    ).map((r) => rowOf('section', r));
    const lessons = new Map(
      (
        await this.prisma.lesson.findMany({
          where: {
            userId,
            id: { in: [...new Set(sections.map((s) => s.lessonId))] },
            deletedAt: null,
          },
        })
      ).map((r) => {
        const lesson = rowOf('lesson', r);
        return [lesson.id, lesson];
      }),
    );
    const own = sections.filter((s) => lessons.has(s.lessonId));
    const ids = new Set(own.map((s) => s.id));
    const missing = [
      ...new Set(own.flatMap((s) => (s.parentId && !ids.has(s.parentId) ? [s.parentId] : []))),
    ];
    const parents = (
      await this.prisma.section.findMany({
        where: { userId, id: { in: missing }, deletedAt: null },
      })
    ).map((r) => rowOf('section', r));

    const ordered = [...lessons.values()].toSorted(byDate).flatMap((lesson) => {
      const mine = own.filter((s) => s.lessonId === lesson.id);
      return readingOrder(mine, [...mine, ...parents]).map((section) => ({ section, lesson }));
    });
    const groups = compile(
      scope,
      ordered.map((note) => ({
        item: note,
        refs: citedRefs(note.section.body),
        date: note.lesson.date,
      })),
      'once',
    ).map((group) => {
      const seen = new Set<string>();
      return {
        passage: group.passage,
        entries: group.entries.map(({ item: { section, lesson }, also, shownUnder }) => {
          seen.add(section.id);
          return {
            sectionId: section.id,
            body: section.body,
            lessonTitle: lesson.title,
            lessonDate: lesson.date,
            nested: !!section.parentId && seen.has(section.parentId),
            also,
            shownUnder,
          };
        }),
      };
    });
    const wholeBook = isWholeBook(scope);
    return {
      scope,
      title: wholeBook ? getBook(scope.book).name : formatPassage(scope),
      wholeBook,
      sections: own.length,
      lessons: new Set(own.map((s) => s.lessonId)).size,
      groups,
      translation: await this.translation(userId),
    };
  }
}

/** A stored row as the device has it, `rev` included. */
const rowOf = <E extends RowEntity>(entity: E, stored: { rev: bigint }): EntityRow<E> =>
  ({ ...toRow(entity, stored), rev: Number(stored.rev) }) as unknown as EntityRow<E>;

/** By date, then when made: the app's `byDate`. */
const byDate = (a: Lesson, b: Lesson) =>
  a.date.localeCompare(b.date) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id);

/**
 * A lesson's sections as the app shows them (outline.ts): top-level sections in order, each
 * followed by its replies. A reply whose parent is missing or is itself a reply shows at the top.
 */
export function outline(sections: readonly Section[]): LessonView['rows'] {
  const byId = new Map(sections.map((s) => [s.id, s]));
  const isTop = (s: Section) => s.parentId === null || !byId.has(s.parentId);
  const shownParent = (s: Section) =>
    !isTop(s) && isTop(byId.get(s.parentId!)!) ? s.parentId : null;
  const replies = new Map<string, Section[]>();
  for (const s of sections) {
    const parent = shownParent(s);
    if (parent) replies.set(parent, [...(replies.get(parent) ?? []), s]);
  }
  return sections
    .filter((s) => shownParent(s) === null)
    .toSorted(compareOrder)
    .flatMap((section) => [
      { section, level: 0 as const },
      ...(replies.get(section.id) ?? [])
        .toSorted(compareOrder)
        .map((reply) => ({ section: reply, level: 1 as const })),
    ]);
}

/** Sections in their lesson's reading order, a reply after its section (the app's `readingOrder`). */
function readingOrder(sections: Section[], all: Section[]): Section[] {
  const byId = new Map(all.map((s) => [s.id, s]));
  const top = (s: Section) => (s.parentId && byId.get(s.parentId)) || s;
  return sections.toSorted(
    (a, b) =>
      compareOrder(top(a), top(b)) ||
      Number(top(a) !== a) - Number(top(b) !== b) ||
      compareOrder(a, b),
  );
}

/** An answer section has text beyond its heading, the question (the app's `hasAnswer`). */
function hasAnswer(body: SectionBody): boolean {
  const [first, ...rest] = body.content;
  const below: SectionBody = {
    type: 'doc',
    content: first?.type === 'heading' ? rest : body.content,
  };
  return toPlainText(below).trim().length > 0;
}
