import { z } from 'zod';
import { verseRefSchema } from './schemas/verse-ref.ts';
import type { VerseRef } from './verse-ref.ts';

/**
 * Section bodies: ProseMirror JSON (the format TipTap stores) restricted to the nodes Lamp uses
 * (TECH-DESIGN §4.2). Node and mark names are TipTap's. Every object is strict, so the editor
 * (M2-07) must be configured to produce exactly these attributes.
 */

export type Mark =
  { type: 'bold' } | { type: 'italic' } | { type: 'link'; attrs: { href: string } };
export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}
/** An inline atom: the verse chip. */
export interface VerseNode {
  type: 'verse';
  attrs: VerseRef;
}
export type InlineNode = TextNode | VerseNode;

export interface Paragraph {
  type: 'paragraph';
  content?: InlineNode[];
}
export interface Heading {
  type: 'heading';
  attrs: { level: 3 };
  content?: InlineNode[];
}
export interface ListItem {
  type: 'listItem';
  /** A paragraph first, as in ProseMirror's list item (`paragraph block*`). */
  content: [Paragraph, ...Block[]];
}
export interface BulletList {
  type: 'bulletList';
  content: ListItem[];
}
export interface OrderedList {
  type: 'orderedList';
  attrs?: { start: number };
  content: ListItem[];
}
export interface Blockquote {
  type: 'blockquote';
  content: Block[];
}
export type Block = Paragraph | Heading | BulletList | OrderedList | Blockquote;
export type TextBlock = Paragraph | Heading;

export interface SectionBody {
  type: 'doc';
  content: Block[];
}

/** Deeper trees than this are rejected before parsing, so a hostile body can't exhaust the stack. */
export const MAX_BODY_DEPTH = 32;

const linkHref = z
  .string()
  .max(2048)
  .regex(/^(https?:\/\/|mailto:)\S+$/i, 'Links must be http, https or mailto');

const markSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('bold') }),
  z.strictObject({ type: z.literal('italic') }),
  z.strictObject({ type: z.literal('link'), attrs: z.strictObject({ href: linkHref }) }),
]);

const textSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().min(1),
  marks: z
    .array(markSchema)
    .refine(
      (marks) => new Set(marks.map((m) => m.type)).size === marks.length,
      'A mark is repeated',
    )
    .optional(),
});

const inlineSchema = z.discriminatedUnion('type', [
  textSchema,
  z.strictObject({ type: z.literal('verse'), attrs: verseRefSchema }),
]);

const paragraphSchema = z.strictObject({
  type: z.literal('paragraph'),
  content: z.array(inlineSchema).optional(),
});

const headingSchema = z.strictObject({
  type: z.literal('heading'),
  attrs: z.strictObject({ level: z.literal(3) }),
  content: z.array(inlineSchema).optional(),
});

const listItemSchema: z.ZodType<ListItem> = z.strictObject({
  type: z.literal('listItem'),
  get content() {
    return z.tuple([paragraphSchema], blockSchema);
  },
});

const blockSchema: z.ZodType<Block> = z.lazy(() =>
  z.discriminatedUnion('type', [
    paragraphSchema,
    headingSchema,
    z.strictObject({ type: z.literal('bulletList'), content: z.array(listItemSchema).min(1) }),
    z.strictObject({
      type: z.literal('orderedList'),
      attrs: z.strictObject({ start: z.int().min(0) }).optional(),
      content: z.array(listItemSchema).min(1),
    }),
    z.strictObject({ type: z.literal('blockquote'), content: z.array(blockSchema).min(1) }),
  ]),
);

/** Validates a whole section body; run on the device and again on the server. */
export const bodySchema: z.ZodType<SectionBody> = z
  .unknown()
  .refine(
    (value) => depth(value) <= MAX_BODY_DEPTH,
    `The body is nested more than ${MAX_BODY_DEPTH} deep`,
  )
  .pipe(z.strictObject({ type: z.literal('doc'), content: z.array(blockSchema).min(1) }));

/** The body of a new, empty section. */
export function emptyBody(): SectionBody {
  return { type: 'doc', content: [{ type: 'paragraph' }] };
}

/** Nesting depth of a JSON value, counted without recursion. */
function depth(value: unknown): number {
  let max = 0;
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [node, level] = stack.pop()!;
    if (typeof node !== 'object' || node === null) continue;
    max = Math.max(max, level);
    if (max > MAX_BODY_DEPTH) return max;
    for (const child of Object.values(node)) stack.push([child, level + 1]);
  }
  return max;
}

/** Calls `visit` on every text block (paragraph or heading) in document order. */
function eachTextBlock(blocks: readonly Block[], visit: (block: TextBlock) => void): void {
  for (const block of blocks) {
    if (block.type === 'paragraph' || block.type === 'heading') visit(block);
    else if (block.type === 'blockquote') eachTextBlock(block.content, visit);
    else for (const item of block.content) eachTextBlock(item.content, visit);
  }
}

/** The text a verse chip stands for in plain text and Markdown: "Romans 8:28 (BSB)". */
function verseLabel(ref: VerseRef): string {
  return `${ref.display} (${ref.translation})`;
}

/**
 * Plain text for search: one line per paragraph, heading or list item paragraph, with each verse
 * chip as its reference ("Romans 8:28"), so a search for the reference finds the note.
 */
export function toPlainText(body: SectionBody): string {
  const lines: string[] = [];
  eachTextBlock(body.content, (block) => {
    const line = (block.content ?? [])
      .map((n) => (n.type === 'text' ? n.text : n.attrs.display))
      .join('');
    if (line.trim()) lines.push(line);
  });
  return lines.join('\n');
}

/** Every verse chip in the body, in document order (the source of the section's citations). */
export function citedRefs(body: SectionBody): VerseRef[] {
  const refs: VerseRef[] = [];
  eachTextBlock(body.content, (block) => {
    for (const node of block.content ?? []) if (node.type === 'verse') refs.push(node.attrs);
  });
  return refs;
}

/**
 * Markdown for export (F11). A verse chip becomes "Romans 8:28 (BSB)" in the sentence, and its
 * snapshot follows the paragraph as a quote: "> **Romans 8:28 (BSB)** And we know…". Headings are
 * `###` unless `headingLevel` says otherwise (a lesson export puts them under its own).
 */
export function toMarkdown(body: SectionBody, { headingLevel = 3 } = {}): string {
  return blocksToMarkdown(body.content, '#'.repeat(headingLevel)).join('\n') + '\n';
}

/** One line of the user's text (a title, a takeaway) as Markdown that shows it as typed. */
export function escapeMarkdown(text: string): string {
  return escapeLineStart(escapeText(text));
}

/** Blocks as lines, with a blank line between blocks. */
function blocksToMarkdown(blocks: readonly Block[], heading: string): string[] {
  const parts = blocks
    .flatMap((block) => blockToMarkdown(block, heading))
    .filter((part) => part.length > 0);
  return parts.flatMap((part, i) => (i === 0 ? part : ['', ...part]));
}

/** One block as one or more parts (a text block's verse quotes are parts of their own). */
function blockToMarkdown(block: Block, heading: string): string[][] {
  switch (block.type) {
    case 'paragraph':
    case 'heading': {
      const text = inlineToMarkdown(block.content ?? []);
      const line = block.type === 'heading' ? `${heading} ${text}` : escapeLineStart(text);
      const quotes = (block.content ?? []).flatMap((node) =>
        node.type === 'verse' && node.attrs.snapshotText ? [verseQuote(node.attrs)] : [],
      );
      return [text ? [line] : [], ...quotes];
    }
    case 'blockquote':
      return [blocksToMarkdown(block.content, heading).map((line) => (line ? `> ${line}` : '>'))];
    case 'bulletList':
      return [block.content.flatMap((item) => listItem('- ', item, heading))];
    case 'orderedList': {
      const start = block.attrs?.start ?? 1;
      return [block.content.flatMap((item, i) => listItem(`${start + i}. `, item, heading))];
    }
  }
}

function listItem(marker: string, item: ListItem, heading: string): string[] {
  const indent = ' '.repeat(marker.length);
  const [first, ...rest] = blocksToMarkdown(item.content, heading);
  return [`${marker}${first ?? ''}`.trimEnd(), ...rest.map((line) => (line ? indent + line : ''))];
}

function verseQuote(ref: VerseRef): string[] {
  const lines = escapeText(ref.snapshotText!.trim()).split(/\r?\n/);
  lines[0] = `**${verseLabel(ref)}** ${lines[0]}`;
  return lines.map((line) => `> ${line}`.trimEnd());
}

const MARK_ORDER = { link: 0, bold: 1, italic: 2 } as const;

const sameMark = (a: Mark, b: Mark) =>
  a.type === b.type && (a.type !== 'link' || a.attrs.href === (b as typeof a).attrs.href);

/** Inline content with marks opened and closed as runs change, so "**a *b***" nests properly. */
function inlineToMarkdown(nodes: readonly InlineNode[]): string {
  let out = '';
  let open: Mark[] = [];

  const closeTo = (keep: number) => {
    if (open.length === keep) return;
    // Emphasis can't end after a space ("**a **"), so trailing spaces move outside the marks.
    const trimmed = out.trimEnd();
    const spaces = out.slice(trimmed.length);
    out = trimmed;
    for (const mark of open.slice(keep).toReversed()) out += closer(mark);
    out += spaces;
    open = open.slice(0, keep);
  };

  for (const node of nodes) {
    const marks =
      node.type === 'text'
        ? (node.marks ?? []).toSorted((a, b) => MARK_ORDER[a.type] - MARK_ORDER[b.type])
        : [];
    let keep = 0;
    while (keep < open.length && keep < marks.length && sameMark(open[keep]!, marks[keep]!)) keep++;
    closeTo(keep);
    let text = node.type === 'text' ? escapeText(node.text) : verseLabel(node.attrs);
    if (marks.length > keep) {
      // Likewise, emphasis can't start before a space.
      const body = text.trimStart();
      out += text.slice(0, text.length - body.length);
      text = body;
      for (const mark of marks.slice(keep)) out += opener(mark);
      open = marks;
    }
    out += text;
  }
  closeTo(0);
  return out;
}

function opener(mark: Mark): string {
  return mark.type === 'link' ? '[' : mark.type === 'bold' ? '**' : '*';
}

function closer(mark: Mark): string {
  if (mark.type !== 'link') return opener(mark);
  return `](${mark.attrs.href.replaceAll('(', '%28').replaceAll(')', '%29')})`;
}

/** Escapes characters that would start Markdown formatting inside a line. */
function escapeText(text: string): string {
  return text.replaceAll(/[\\`*_[\]<>]/g, '\\$&');
}

/** Escapes a paragraph that would otherwise read as a heading, list item or quote. */
function escapeLineStart(line: string): string {
  return line
    .replace(/^(#{1,6}(?:\s|$)|[-+](?:\s|$))/, '\\$1')
    .replace(/^(\d+)([.)])(?=\s|$)/, '$1\\$2');
}
