import { z } from 'zod';
import { BOOK_CODES } from '../books.ts';
import { bodySchema } from '../doc.ts';
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
export const QUESTION_STATUSES = ['open', 'answered', 'parked'] as const;
export const HIGHLIGHT_COLOURS = ['yellow', 'green', 'blue', 'pink'] as const;
export const CITATION_SOURCE_TYPES = ['lesson', 'section', 'highlight', 'memory_item'] as const;
export const THEME_PRESETS = [
  'parchment',
  'vellum',
  'olive',
  'slate',
  'cedar',
  'midnight',
] as const;
export const COLOR_MODES = ['light', 'dark', 'system'] as const;
export const USER_ROLES = ['user', 'admin'] as const;

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
  themePreset: z.enum(THEME_PRESETS),
  colorMode: z.enum(COLOR_MODES),
  defaultTranslation: z.enum(TRANSLATIONS),
  reviewWindowDays: z.int().min(1).max(365),
  /** Each paragraph's verse chips show their text under it (F3). */
  autoPreviewVerses: z.boolean(),
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

export const questionSchema = z.strictObject({
  ...synced,
  lessonId: idSchema,
  text: lineSchema(2000),
  status: z.enum(QUESTION_STATUSES),
  answerSectionId: idSchema.nullable(),
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
export type Highlight = z.infer<typeof highlightSchema>;
export type MemoryItem = z.infer<typeof memoryItemSchema>;
export type Citation = z.infer<typeof citationSchema>;
export type EntityRow<E extends EntityName = EntityName> = z.infer<(typeof ENTITY_SCHEMAS)[E]>;
