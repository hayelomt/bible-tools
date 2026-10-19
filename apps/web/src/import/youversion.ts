import {
  type BookCode,
  formatPassage,
  HIGHLIGHT_COLOURS,
  isBookCode,
  type Passage,
  passageRange,
  verseCount,
  type VerseRef,
  youVersionLabel,
} from '@lamp/domain';
import { z } from 'zod';

/**
 * The YouVersion export (F21, M9-11), read on the device. **The format is a guess** until a real
 * export arrives (M8-05; TECH-DESIGN §17.11): records ("moments") of kind `highlight`, `note` or
 * `bookmark`, each with `created_dt`, a `content` note, a six-digit hex `color` and `references`
 * (`version_id` and one USFM id per verse). Only this module knows the format, so a real export
 * changes it alone. Fields Lamp doesn't use are ignored; bookmarks aren't imported.
 */

const referenceSchema = z.object({
  version_id: z.union([z.number(), z.string()]).nullish(),
  usfm: z.array(z.string()).min(1),
  /** The verse text, if the export carries it. */
  text: z.string().nullish(),
});

const momentSchema = z.object({
  kind: z.string(),
  created_dt: z.string(),
  content: z.string().nullish(),
  color: z.string().nullish(),
  references: z.array(referenceSchema).nullish(),
});

/** A list of moments, alone or as `moments` (or `data`) in an object. */
const exportSchema = z.union([
  z.array(z.unknown()),
  z.object({ moments: z.array(z.unknown()) }).transform((file) => file.moments),
  z.object({ data: z.array(z.unknown()) }).transform((file) => file.data),
]);

/** The file isn't an export this module can read; nothing is imported. */
export class ImportFormatError extends Error {
  constructor(reason: string) {
    super(`Not a YouVersion export Lamp can read: ${reason}`);
    this.name = 'ImportFormatError';
  }
}

/** One inbox item to import, before its chip's text is filled from Lamp's book. */
export interface ImportedItem {
  ref: VerseRef | null;
  text: string | null;
  receivedAt: string;
  colour: (typeof HIGHLIGHT_COLOURS)[number] | null;
}

const IMPORTED_KINDS = new Set(['highlight', 'note']);
/** An inbox item's text limit (§17.2). */
const MAX_TEXT = 10_000;

/** The records in an export file's JSON: the highlights and notes, as they come. */
export function exportRecords(json: unknown): unknown[] {
  const file = exportSchema.safeParse(json);
  if (!file.success) throw new ImportFormatError('no list of highlights and notes');
  return file.data;
}

/**
 * The inbox items for one record: one per reference (a reference's verses joined into ranges),
 * the note on the first; a note without references is one item of text. A bookmark, or a record
 * this format doesn't describe, gives none: null when it can't be read at all.
 */
export function recordItems(record: unknown): ImportedItem[] | null {
  const parsed = momentSchema.safeParse(record);
  if (!parsed.success) return null;
  const moment = parsed.data;
  if (!IMPORTED_KINDS.has(moment.kind)) return [];
  const time = Date.parse(moment.created_dt);
  if (Number.isNaN(time)) return null;
  const receivedAt = new Date(time).toISOString();
  const note = moment.content?.trim().slice(0, MAX_TEXT) || null;
  const colour = moment.kind === 'highlight' ? nearestColour(moment.color) : null;

  const refs = (moment.references ?? []).flatMap(referenceChips);
  if (refs.length === 0) {
    return note ? [{ ref: null, text: note, receivedAt, colour }] : null;
  }
  return refs.map((ref, i) => ({ ref, text: i === 0 ? note : null, receivedAt, colour }));
}

/**
 * A reference's chips: its verses joined into ranges, labelled with the version. From the BSB or
 * KJV, a chip is the passage alone, the app's own text (decision 97).
 */
function referenceChips(reference: z.infer<typeof referenceSchema>): VerseRef[] {
  const id = reference.version_id == null ? null : String(reference.version_id);
  const label = id === null ? undefined : youVersionLabel(id);
  const verses = reference.usfm.flatMap((usfm) => verseOf(usfm) ?? []);
  const exported = reference.text?.trim();
  return ranges(verses).map((passage, i, all): VerseRef => {
    const ref = { ...passage, display: formatPassage(passage) };
    if (label === 'BSB' || label === 'KJV') return ref;
    return {
      ...ref,
      translation: 'shared',
      ...(label && { versionLabel: label }),
      // Exported text belongs to the whole reference: kept when it's one range.
      ...(exported && all.length === 1 && i === 0 && { snapshotText: exported }),
    };
  });
}

interface Verse {
  book: BookCode;
  chapter: number;
  verse: number;
}

/** `JHN.3.16`; anything else (a chapter alone, an unknown book) is none. */
function verseOf(usfm: string): Verse | null {
  const [book, chapter, verse, ...rest] = usfm.trim().toUpperCase().split('.');
  if (rest.length > 0 || !book || !isBookCode(book) || !chapter || !verse) return null;
  const [c, v] = [Number(chapter), Number(verse)];
  if (!Number.isInteger(c) || !Number.isInteger(v) || c < 1 || v < 1) return null;
  if (v > verseCount(book, c)) return null;
  return { book, chapter: c, verse: v };
}

/** Verses in order, each run of consecutive verses as one passage. */
function ranges(verses: readonly Verse[]): Passage[] {
  const sorted = verses
    .map((v) => ({
      ...v,
      ord: passageRange({ book: v.book, chapter: v.chapter, verseStart: v.verse })[0],
    }))
    .toSorted((a, b) => a.ord - b.ord);
  const passages: Passage[] = [];
  let start: Verse | null = null;
  let last: Verse | null = null;
  const close = () => {
    if (!start || !last) return;
    passages.push({
      book: start.book,
      chapter: start.chapter,
      verseStart: start.verse,
      ...(last.chapter !== start.chapter && { chapterEnd: last.chapter }),
      ...((last.chapter !== start.chapter || last.verse !== start.verse) && {
        verseEnd: last.verse,
      }),
    });
  };
  for (const verse of sorted) {
    if (last && sameVerse(last, verse)) continue;
    if (!start || !last || !follows(last, verse)) {
      close();
      start = verse;
    }
    last = verse;
  }
  close();
  return passages;
}

const sameVerse = (a: Verse, b: Verse) =>
  a.book === b.book && a.chapter === b.chapter && a.verse === b.verse;

/** Whether `next` is the verse right after `verse`, in the same book. */
function follows(verse: Verse, next: Verse): boolean {
  if (verse.book !== next.book) return false;
  if (next.chapter === verse.chapter) return next.verse === verse.verse + 1;
  return (
    next.chapter === verse.chapter + 1 &&
    next.verse === 1 &&
    verse.verse === verseCount(verse.book, verse.chapter)
  );
}

/** Lamp's highlight colours as RGB, to map an exported colour to the nearest. */
const COLOUR_RGB: Record<(typeof HIGHLIGHT_COLOURS)[number], [number, number, number]> = {
  yellow: [255, 230, 80],
  green: [110, 220, 120],
  blue: [90, 180, 255],
  pink: [255, 140, 200],
};

/** A six-digit hex colour ("fffe00", "#5dff79") as the nearest of the four; null if none. */
export function nearestColour(hex: string | null | undefined): ImportedItem['colour'] {
  const match = /^#?([0-9a-f]{6})$/iu.exec(hex?.trim() ?? '');
  if (!match) return null;
  const value = Number.parseInt(match[1]!, 16);
  const rgb = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  let best: ImportedItem['colour'] = null;
  let distance = Infinity;
  for (const colour of HIGHLIGHT_COLOURS) {
    const d = COLOUR_RGB[colour].reduce((sum, c, i) => sum + (c - rgb[i]!) ** 2, 0);
    if (d < distance) [best, distance] = [colour, d];
  }
  return best;
}

/**
 * What makes an imported item the same as one already there (§17.2): the passage, when it
 * arrived, and its text. Dismissed items count, so importing again doesn't undo a dismissal.
 */
export function importKey(item: Pick<ImportedItem, 'ref' | 'receivedAt' | 'text'>): string {
  const range = item.ref ? passageRange(item.ref).join('-') : '';
  return `${range}|${new Date(item.receivedAt).toISOString()}|${item.text ?? ''}`;
}
