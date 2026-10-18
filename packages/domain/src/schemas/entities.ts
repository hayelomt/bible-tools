import { z } from 'zod';
import { BOOK_CODES } from '../books.ts';
import { bodySchema, LINK_TARGET_TYPES } from '../doc.ts';
import { OPEN_IN_TARGETS } from '../open-in.ts';
import { isOrderKey } from '../order.ts';
import { TRANSLATIONS } from '../verse-ref.ts';
import {
  dateSchema,
  idSchema,
  lineSchema,
  revSchema,
  textSchema,
  timestampSchema,
} from './common.ts';
import { verseRefSchema } from './verse-ref.ts';

/**
 * Entity rows as the device stores them and the sync API sends them (TECH-DESIGN §5.2, §6.1):
 * the database columns minus `userId`, with `rev` as a number and times as ISO strings. Every
 * column is present; a nullable column is `null`, never missing. The API's contract test checks
 * these against the migrated database.
 */

export const SERIES_KINDS = ['sermon_series', 'book_study', 'custom'] as const;
export const LESSON_SOURCES = ['sermon', 'personal', 'group'] as const;
/** A question's status, derived from its entries (`questionStatus`, §17.5). */
export const QUESTION_STATUSES = ['open', 'answered', 'parked'] as const;
/** What happened to a question, one entry each (F24, §17.5). */
export const QUESTION_ENTRY_KINDS = [
  'asked',
  'revisited',
  'partial',
  'answered',
  'reopened',
  'parked',
] as const;
export const HIGHLIGHT_COLOURS = ['yellow', 'green', 'blue', 'pink'] as const;
export const CITATION_SOURCE_TYPES = ['lesson', 'section', 'highlight', 'memory_item'] as const;
export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export const USER_ROLES = ['user', 'admin'] as const;
/** How an inbox item arrived (§17.2): shared, pasted or typed into the add box, imported, captured. */
export const INBOX_ORIGINS = ['share', 'paste', 'typed', 'import', 'capture'] as const;

/** Fields every synced row carries (§5.1). */
const synced = {
  id: idSchema,
  createdAt: timestampSchema,
  /** Client time, adjusted by the clock offset (§6.5). */
  updatedAt: timestampSchema,
  rev: revSchema,
  /** A tombstone, so deletes sync. */
  deletedAt: timestampSchema.nullable(),
};

/** One row per account, keyed by the user, so it has no id, createdAt or tombstone. */
export const userSettingsSchema = z.strictObject({
  /** Light, dark, or "system" (Auto: follows the device). The app has one theme, Lamplight. */
  colorMode: z.enum(COLOR_MODES),
  defaultTranslation: z.enum(TRANSLATIONS),
  reviewWindowDays: z.int().min(1).max(365),
  /** Each paragraph's verse chips show their text under it (F3). */
  autoPreviewVerses: z.boolean(),
  /** Pasting offers verse chips for the references and verses in the text (F19). */
  pasteChips: z.boolean(),
  /** The "Open in…" targets shown in the verse sheet, in order (F20); a hidden one is left out. */
  openInTargets: z
    .array(z.enum(OPEN_IN_TARGETS))
    .max(OPEN_IN_TARGETS.length)
    .refine((keys) => new Set(keys).size === keys.length, 'A target is listed twice'),
  rev: revSchema,
  updatedAt: timestampSchema,
});

export const seriesSchema = z.strictObject({
  ...synced,
  title: lineSchema(200),
  description: textSchema(5000),
  kind: z.enum(SERIES_KINDS),
});

export const lessonSchema = z.strictObject({
  ...synced,
  seriesId: idSchema.nullable(),
  title: lineSchema(200),
  date: dateSchema,
  source: z.enum(LESSON_SOURCES),
  speaker: lineSchema(200).nullable(),
  church: lineSchema(200).nullable(),
  mainPassages: z.array(verseRefSchema).max(20),
});

export const sectionSchema = z.strictObject({
  ...synced,
  lessonId: idSchema,
  parentId: idSchema.nullable(),
  orderKey: z.string().max(500).refine(isOrderKey, 'Not an order key'),
  body: bodySchema,
  /** The section a conflicted copy was made from (§6.4). */
  conflictOf: idSchema.nullable(),
  /** The device that wrote a conflicted copy's body, for its label (§6.4); null when unknown. */
  conflictDevice: lineSchema(100).nullable(),
});

export const tagSchema = z.strictObject({
  ...synced,
  name: lineSchema(50),
  isSeeded: z.boolean(),
});

export const sectionTagSchema = z.strictObject({ ...synced, tagId: idSchema, sectionId: idSchema });

export const lessonTagSchema = z.strictObject({ ...synced, tagId: idSchema, lessonId: idSchema });

export const takeawaySchema = z.strictObject({
  ...synced,
  lessonId: idSchema,
  text: lineSchema(2000),
});

/**
 * A question (F5). Its status and answer are its entries (`questionEntrySchema`); `status` and
 * `answerSectionId` left the wire format in M10 and stay in the database, unwritten, for a release.
 */
export const questionSchema = z.strictObject({
  ...synced,
  lessonId: idSchema,
  text: lineSchema(2000),
});

/** One thing that happened to a question, in a lesson (F24, §17.5). */
export const questionEntrySchema = z.strictObject({
  ...synced,
  questionId: idSchema,
  /** The lesson it happened in: the question's own, or the one it was revisited from. */
  lessonId: idSchema,
  kind: z.enum(QUESTION_ENTRY_KINDS),
  /** The section holding a partial or full answer. */
  sectionId: idSchema.nullable(),
});

export const highlightSchema = z.strictObject({
  ...synced,
  ref: verseRefSchema,
  colour: z.enum(HIGHLIGHT_COLOURS),
  note: textSchema(5000).nullable(),
  promotedSectionId: idSchema.nullable(),
});

/** SM-2 state (§4.3, `srs.ts`). */
export const memoryItemSchema = z.strictObject({
  ...synced,
  ref: verseRefSchema,
  ease: z.number().min(1.3).max(10),
  /** Days until the next review. */
  interval: z.int().min(0),
  nextReviewAt: timestampSchema,
  reviewCount: z.int().min(0),
});

/** An http or https address, as shared from another app. */
const webUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);

/**
 * A verse or a note waiting to be put in a lesson (F17, §17.2). Not indexed until it's placed.
 * The fields without the check that it holds something, since a refined object can't be `omit`ted
 * (the push schema drops `rev`).
 */
export const inboxItemFields = z.strictObject({
  ...synced,
  origin: z.enum(INBOX_ORIGINS),
  /** The chip, with its snapshot. */
  ref: verseRefSchema.nullable(),
  /** The note, or the text around the reference. */
  text: textSchema(10_000).nullable(),
  sourceUrl: webUrlSchema.nullable(),
  /** When it arrived; for an import, the date in the export. Sorts the inbox. */
  receivedAt: timestampSchema,
  /** An imported highlight's colour. */
  colour: z.enum(HIGHLIGHT_COLOURS).nullable(),
  /** One id per import run, so an import can be dismissed as one (M9-12). */
  importId: idSchema.nullable(),
  /** "Process later" (F27). */
  snoozedUntil: dateSchema.nullable(),
  /** The section it was put in; cleared again by Undo. */
  placedInSectionId: idSchema.nullable(),
});

/** An inbox item holds a chip, some text, or both (the table's CHECK). */
export const hasRefOrText = (item: { ref: unknown; text: string | null }): boolean =>
  item.ref !== null || (item.text !== null && item.text.trim() !== '');
const REF_OR_TEXT = { message: 'An inbox item needs a verse or some text', path: ['text'] };

export const inboxItemSchema = inboxItemFields.refine(hasRefOrText, REF_OR_TEXT);

/** The push's inbox item row: without `rev`, with the same check. */
export const inboxItemChangeRow = inboxItemFields
  .omit({ rev: true })
  .refine(hasRefOrText, REF_OR_TEXT);

/**
 * A row of the derived verse index (§5.2). Built from its source row on the device and on the
 * server, never pushed, so it has no sync fields.
 */
export const citationSchema = z.strictObject({
  id: idSchema,
  sourceType: z.enum(CITATION_SOURCE_TYPES),
  sourceId: idSchema,
  lessonId: idSchema.nullable(),
  book: z.enum(BOOK_CODES),
  startOrd: z.int().min(0),
  endOrd: z.int().min(0),
});

/**
 * A row of the derived link index (F23, §17.4): a link chip in a section body. Built from the
 * section on the device and on the server, never pushed. `targetId` names no row for certain: a
 * link can be broken.
 */
export const linkSchema = z.strictObject({
  id: idSchema,
  fromSectionId: idSchema,
  fromLessonId: idSchema,
  targetType: z.enum(LINK_TARGET_TYPES),
  targetId: idSchema,
});

/** The synced entities, by the name used in sync changes and device tables. */
export const ENTITY_SCHEMAS = {
  userSettings: userSettingsSchema,
  series: seriesSchema,
  lesson: lessonSchema,
  section: sectionSchema,
  tag: tagSchema,
  sectionTag: sectionTagSchema,
  lessonTag: lessonTagSchema,
  takeaway: takeawaySchema,
  question: questionSchema,
  highlight: highlightSchema,
  memoryItem: memoryItemSchema,
  inboxItem: inboxItemSchema,
  questionEntry: questionEntrySchema,
} as const;

export type EntityName = keyof typeof ENTITY_SCHEMAS;
export const ENTITY_NAMES = Object.keys(ENTITY_SCHEMAS) as EntityName[];

export type UserSettings = z.infer<typeof userSettingsSchema>;
export type Series = z.infer<typeof seriesSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Tag = z.infer<typeof tagSchema>;
export type SectionTag = z.infer<typeof sectionTagSchema>;
export type LessonTag = z.infer<typeof lessonTagSchema>;
export type Takeaway = z.infer<typeof takeawaySchema>;
export type Question = z.infer<typeof questionSchema>;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];
export type QuestionEntry = z.infer<typeof questionEntrySchema>;
export type QuestionEntryKind = (typeof QUESTION_ENTRY_KINDS)[number];
export type Link = z.infer<typeof linkSchema>;
export type Highlight = z.infer<typeof highlightSchema>;
export type MemoryItem = z.infer<typeof memoryItemSchema>;
export type InboxItem = z.infer<typeof inboxItemSchema>;
export type InboxOrigin = (typeof INBOX_ORIGINS)[number];
export type Citation = z.infer<typeof citationSchema>;
export type EntityRow<E extends EntityName = EntityName> = z.infer<(typeof ENTITY_SCHEMAS)[E]>;
