import type {
  Lesson,
  Passage,
  QuestionStatus,
  Section,
  SectionBody,
  Series,
  TranslationId,
} from '@lamp/domain';

/** What a shared page shows, read from the owner's rows (`shared-rows.service.ts`). */

/** A lesson, its sections in reading order, and what the print view shows with them. */
export interface LessonView {
  lesson: Lesson;
  /** Top-level sections in order, each followed by its replies (level 1). */
  rows: { section: Section; level: 0 | 1 }[];
  /** Tag names by section id. */
  sectionTags: ReadonlyMap<string, string[]>;
  tags: string[];
  takeaways: string[];
  questions: { text: string; status: QuestionStatus }[];
}

export interface SeriesView {
  series: Series;
  /** Live, in date order. */
  lessons: Lesson[];
}

/** One section in a compile view, with its lesson for the byline. */
export interface CommentaryEntry {
  sectionId: string;
  body: SectionBody;
  lessonTitle: string;
  lessonDate: string;
  /** A reply shown under its section, just above it in the same group. */
  nested: boolean;
  /** The other groups it's under: "Also under Romans 8:38". */
  also: Passage[];
  /** Shown in full under an earlier group: a pointer to it there. */
  shownUnder: Passage | null;
}

/**
 * A compile view (F22), as the app's commentary shows it. A frozen link stores this as its
 * snapshot (M13-03); a live one works it out on each visit. JSON as it is, so it can be stored.
 */
export interface CommentaryView {
  scope: Passage;
  /** "Romans 8", or "Romans" for the whole book. */
  title: string;
  wholeBook: boolean;
  sections: number;
  lessons: number;
  groups: { passage: Passage; entries: CommentaryEntry[] }[];
  /**
   * The owner's translation when it was worked out, which its chips quote (decision 97): a frozen
   * link's stays as it was. Absent from a snapshot made before.
   */
  translation?: TranslationId;
}
