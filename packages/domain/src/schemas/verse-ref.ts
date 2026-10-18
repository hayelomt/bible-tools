import { z } from 'zod';
import { BOOK_CODES } from '../books.ts';
import { describeParseError } from '../parse-reference.ts';
import { CHIP_TRANSLATIONS, checkPassage, type Passage } from '../verse-ref.ts';

const count = z.int().min(1);

const passageFields = {
  book: z.enum(BOOK_CODES),
  chapter: count,
  verseStart: count.optional(),
  chapterEnd: count.optional(),
  verseEnd: count.optional(),
};

/** Rejects a passage the book table doesn't allow (no Romans 17, no Jude 1:30). */
function inBookTable(passage: Passage, ctx: z.RefinementCtx) {
  const error = checkPassage(passage);
  if (error) ctx.addIssue({ code: 'custom', message: describeParseError(error) });
}

/** A passage without its text (TECH-DESIGN §4.1). */
export const passageSchema = z.strictObject(passageFields).superRefine(inBookTable);

/**
 * A verse reference as stored in notes, highlights and memory items. `display` is not checked
 * against the fields, so a reference stays valid if the formatting rules change.
 */
export const verseRefSchema = z
  .strictObject({
    ...passageFields,
    display: z.string().min(1).max(200),
    translation: z.enum(CHIP_TRANSLATIONS),
    versionLabel: z.string().trim().min(1).max(16).optional(),
    snapshotText: z.string().max(100_000).optional(),
  })
  .superRefine(inBookTable);
