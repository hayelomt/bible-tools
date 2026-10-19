import { z } from 'zod';
import type { VerseNode } from './doc.ts';
import { findReferences } from './find-references.ts';
import { verseRefSchema } from './schemas/verse-ref.ts';

/**
 * A comment's body (F35, M13-09, §17.12): plain text and verse chips, one paragraph per line, as a
 * section body restricted to those, so the app shows it as it shows a note. It's typed as plain
 * text (decided 2026-10-19); the references in it become chips when it's posted.
 */

/** The most characters a comment holds, a chip counting as its reference. */
export const MAX_COMMENT_LENGTH = 2000;
/** The most lines: each is a paragraph. */
const MAX_COMMENT_LINES = 100;

const inlineSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('text'), text: z.string().min(1) }),
  z.strictObject({ type: z.literal('verse'), attrs: verseRefSchema }),
]);

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).optional(),
});

/** A line of a comment: its text and chips. */
export interface CommentParagraph {
  type: 'paragraph';
  content?: ({ type: 'text'; text: string } | VerseNode)[];
}
export interface CommentBody {
  type: 'doc';
  content: CommentParagraph[];
}

export const commentBodySchema: z.ZodType<CommentBody> = z
  .strictObject({
    type: z.literal('doc'),
    content: z.array(paragraphSchema).min(1).max(MAX_COMMENT_LINES),
  })
  .refine(
    (body) => commentText(body).length <= MAX_COMMENT_LENGTH,
    `A comment holds at most ${MAX_COMMENT_LENGTH} characters`,
  )
  .refine((body) => commentText(body).trim() !== '', 'A comment needs some text');

/**
 * A comment typed as plain text, as its body: a paragraph per line, and each reference in it
 * ("John 10:9", "Ps 23:1–3") a verse chip.
 */
export function commentBody(text: string): CommentBody {
  const lines = text.trim().split(/\r?\n/u);
  return {
    type: 'doc',
    content: lines.map((line) => {
      const content: NonNullable<CommentParagraph['content']> = [];
      let at = 0;
      for (const found of findReferences(line)) {
        if (found.from > at) content.push({ type: 'text', text: line.slice(at, found.from) });
        content.push({ type: 'verse', attrs: { ...found.ref } } satisfies VerseNode);
        at = found.to;
      }
      if (at < line.length) content.push({ type: 'text', text: line.slice(at) });
      return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
    }),
  };
}

/** A comment as plain text, to edit it again: each chip as its reference, a line per paragraph. */
export function commentText(body: CommentBody): string {
  return body.content
    .map((paragraph) =>
      (paragraph.content ?? [])
        .map((node) => (node.type === 'text' ? node.text : node.attrs.display))
        .join(''),
    )
    .join('\n');
}
