import { z } from 'zod';
import { BOOK_CODES, type BookCode } from './books.ts';
import { refTranslation, type TranslationId, type VerseRef } from './verse-ref.ts';

/**
 * "Open in…" (F20, TECH-DESIGN §17.11): the reading and study apps a chip can hand its passage to.
 * The keys are what `UserSettings.openInTargets` lists, in the order the user chose.
 */
export const OPEN_IN_TARGETS = ['blueletterbible', 'youversion', 'biblehub', 'logos'] as const;
export type OpenInTarget = (typeof OPEN_IN_TARGETS)[number];

/** A link template; `{book}`, `{chapter}`, `{verse}`, `{chapterEnd}`, `{verseEnd}`, `{version}`. */
const templateSchema = z
  .string()
  .regex(/^https:\/\//u)
  .max(300);

const linksSchema = z.strictObject({
  /** One verse. */
  verse: templateSchema,
  /** Verses in one chapter; without it, the first verse. */
  range: templateSchema.optional(),
  /** A whole chapter; a chapter range opens its first chapter. */
  chapter: templateSchema,
  /** A range across chapters ("Rom 7:24–8:2"); without it, the first verse. */
  crossChapter: templateSchema.optional(),
});
export type OpenInLinks = z.infer<typeof linksSchema>;

const targetSchema = z.strictObject({
  key: z.enum(OPEN_IN_TARGETS),
  name: z.string().min(1).max(40),
  /** The target's code for each book; a book left out uses its USFM id. */
  books: z.partialRecord(z.enum(BOOK_CODES), z.string().min(1).max(30)).optional(),
  /**
   * The target's code for a chip's version: its translation (`BSB`, `KJV`) or version label
   * ("NIV"). `*` is for any other chip, `shared` or `pasted` without a label the target knows.
   */
  versions: z.record(z.string(), z.string().max(20)).refine((v) => '*' in v, 'No `*` version'),
  links: linksSchema,
  /** Links that differ for one version code (Bible Hub's BSB pages). */
  versionLinks: z.record(z.string(), linksSchema.partial()).optional(),
});
export type OpenInTargetSpec = z.infer<typeof targetSchema>;

/**
 * The target table (`open-in.json`, M9-10), served network-first so a format can change without a
 * release. `version` is the table's own format; a table this code can't read is ignored.
 */
export const openInTableSchema = z.strictObject({
  version: z.literal(1),
  targets: z.array(targetSchema).min(1).max(20),
});
export type OpenInTable = z.infer<typeof openInTableSchema>;

type ChipPassage = Pick<
  VerseRef,
  'book' | 'chapter' | 'verseStart' | 'chapterEnd' | 'verseEnd' | 'translation' | 'versionLabel'
>;

/**
 * The address that opens `ref` in `target` (F20): the target's own book code and version, in the
 * link for the kind of passage; the app's own text in `active`, the translation picked in Settings.
 * A target without range links opens a range at its first verse, as YouVersion and Blue Letter
 * Bible need for a range across chapters (§17.11).
 */
export function openInUrl(
  target: OpenInTargetSpec,
  ref: ChipPassage,
  active: TranslationId,
): string {
  const version =
    (ref.versionLabel == null
      ? target.versions[refTranslation(ref, active)]
      : target.versions[ref.versionLabel]) ?? target.versions['*']!;
  const links = { ...target.links, ...target.versionLinks?.[version] };
  const fields: Record<string, string | number> = {
    book: target.books?.[ref.book as BookCode] ?? ref.book,
    chapter: ref.chapter,
    version,
  };
  let template: string;
  // An editor's chip has its unset fields as null: the same as absent.
  const { verseStart, chapterEnd, verseEnd } = ref;
  if (verseStart == null) {
    template = links.chapter;
  } else {
    fields.verse = verseStart;
    if (chapterEnd != null && verseEnd != null && links.crossChapter) {
      template = links.crossChapter;
      fields.chapterEnd = chapterEnd;
      fields.verseEnd = verseEnd;
    } else if (chapterEnd == null && verseEnd != null && links.range) {
      template = links.range;
      fields.verseEnd = verseEnd;
    } else {
      template = links.verse;
    }
  }
  return template.replaceAll(/\{(\w+)\}/gu, (whole, name: string) =>
    name in fields ? encodeURIComponent(String(fields[name])).replaceAll('%3B', ';') : whole,
  );
}

/**
 * The targets to show, in the user's order (`openInTargets`), from the ones the table has. A key
 * the table lacks is skipped.
 */
export function shownTargets(
  table: OpenInTable,
  keys: readonly OpenInTarget[],
): OpenInTargetSpec[] {
  return keys.flatMap((key) => table.targets.find((target) => target.key === key) ?? []);
}
