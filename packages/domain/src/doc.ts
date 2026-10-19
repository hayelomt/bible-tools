import { z } from 'zod';
import { idSchema, lineSchema } from './schemas/common.ts';
import { verseRefSchema } from './schemas/verse-ref.ts';
import { translationLabel, type VerseRef } from './verse-ref.ts';

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
/** What a link chip can point at (F23, §17.4). */
export const LINK_TARGET_TYPES = ['lesson', 'section'] as const;
export type LinkTargetType = (typeof LINK_TARGET_TYPES)[number];
export interface NoteLinkAttrs {
  targetType: LinkTargetType;
  targetId: string;
  /** The target's title when the link was made; shown only once the target is gone. */
  label: string;
}
/** An inline atom: a link to another lesson or section (F23). */
export interface NoteLinkNode {
  type: 'noteLink';
  attrs: NoteLinkAttrs;
}
export type InlineNode = TextNode | VerseNode | NoteLinkNode;

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

/** A link chip's label: one line, up to 200 characters. */
export const MAX_LINK_LABEL = 200;

const noteLinkAttrsSchema = z.strictObject({
  targetType: z.enum(LINK_TARGET_TYPES),
  targetId: idSchema,
  label: lineSchema(MAX_LINK_LABEL),
});

const inlineSchema = z.discriminatedUnion('type', [
  textSchema,
  z.strictObject({ type: z.literal('verse'), attrs: verseRefSchema }),
  z.strictObject({ type: z.literal('noteLink'), attrs: noteLinkAttrsSchema }),
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

/** The text a verse chip stands for in plain text and Markdown: "Romans 8:28 (BSB)", "(NIV)". */
function verseLabel(ref: VerseRef): string {
  return `${ref.display} (${translationLabel(ref)})`;
}

/** An inline node as plain text: a verse chip as its reference, a link chip as its label. */
function inlineText(node: InlineNode): string {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'verse':
      return node.attrs.display;
    case 'noteLink':
      return node.attrs.label;
  }
}

/**
 * Plain text for search: one line per paragraph, heading or list item paragraph, with each verse
 * chip as its reference ("Romans 8:28"), so a search for the reference finds the note, and each
 * link chip as its label.
 */
export function toPlainText(body: SectionBody): string {
  const lines: string[] = [];
  eachTextBlock(body.content, (block) => {
    const line = (block.content ?? []).map(inlineText).join('');
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

/** Every link chip in the body, in document order, repeats included (the source of its links). */
export function linkedTargets(body: SectionBody): NoteLinkAttrs[] {
  const links: NoteLinkAttrs[] = [];
  eachTextBlock(body.content, (block) => {
    for (const node of block.content ?? []) if (node.type === 'noteLink') links.push(node.attrs);
  });
  return links;
}

/**
 * How a link chip is written in Markdown: its text and a relative reference; its text alone for a
 * target that can't be referenced (not on the device); or null for a target that's gone, written
 * as its label and "(deleted)". The caller resolves targets; the domain doesn't read rows.
 */
export type LinkWriter = (link: NoteLinkAttrs) => { text: string; href?: string } | null;

export interface MarkdownOptions {
  /** `###` by default; a lesson export puts section headings under its own. */
  headingLevel?: number;
  /** Without one, a link chip is its label as plain text. */
  links?: LinkWriter;
}

/**
 * Markdown for export (F11). A verse chip becomes "Romans 8:28 (BSB)" in the sentence, and its
 * snapshot follows the paragraph as a quote: "> **Romans 8:28 (BSB)** And we know…". A link chip
 * becomes a relative reference, as `links` writes it (F23, decided in M10-05): "[The Good
 * Shepherd](2026-10-12-the-good-shepherd.md)".
 */
export function toMarkdown(
  body: SectionBody,
  { headingLevel = 3, links }: MarkdownOptions = {},
): string {
  const context: Context = { heading: '#'.repeat(headingLevel), links };
  return blocksToMarkdown(body.content, context).join('\n') + '\n';
}

/** What every block of one export shares. */
interface Context {
  heading: string;
  links: LinkWriter | undefined;
}

/** One line of the user's text (a title, a takeaway) as Markdown that shows it as typed. */
export function escapeMarkdown(text: string): string {
  return escapeLineStart(escapeText(text));
}

/** Blocks as lines, with a blank line between blocks. */
function blocksToMarkdown(blocks: readonly Block[], context: Context): string[] {
  const parts = blocks
    .flatMap((block) => blockToMarkdown(block, context))
    .filter((part) => part.length > 0);
  return parts.flatMap((part, i) => (i === 0 ? part : ['', ...part]));
}

/** One block as one or more parts (a text block's verse quotes are parts of their own). */
function blockToMarkdown(block: Block, context: Context): string[][] {
  switch (block.type) {
    case 'paragraph':
    case 'heading': {
      const text = inlineToMarkdown(block.content ?? [], context.links);
      const line = block.type === 'heading' ? `${context.heading} ${text}` : escapeLineStart(text);
      const quotes = (block.content ?? []).flatMap((node) =>
        node.type === 'verse' && node.attrs.snapshotText ? [verseQuote(node.attrs)] : [],
      );
      return [text ? [line] : [], ...quotes];
    }
    case 'blockquote':
      return [blocksToMarkdown(block.content, context).map((line) => (line ? `> ${line}` : '>'))];
    case 'bulletList':
      return [block.content.flatMap((item) => listItem('- ', item, context))];
    case 'orderedList': {
      const start = block.attrs?.start ?? 1;
      return [block.content.flatMap((item, i) => listItem(`${start + i}. `, item, context))];
    }
  }
}

function listItem(marker: string, item: ListItem, context: Context): string[] {
  const indent = ' '.repeat(marker.length);
  const [first, ...rest] = blocksToMarkdown(item.content, context);
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
function inlineToMarkdown(nodes: readonly InlineNode[], links: LinkWriter | undefined): string {
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
    let text =
      node.type === 'text'
        ? escapeText(node.text)
        : node.type === 'verse'
          ? verseLabel(node.attrs)
          : linkToMarkdown(node.attrs, links);
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

/** A link chip: "[Title](file.md)", its label alone without a writer, or "Title (deleted)". */
function linkToMarkdown(link: NoteLinkAttrs, links: LinkWriter | undefined): string {
  if (!links) return escapeText(link.label);
  const target = links(link);
  if (!target) return `${escapeText(link.label)} (deleted)`;
  if (target.href === undefined) return escapeText(target.text);
  return `[${escapeText(target.text)}](${escapeHref(target.href)})`;
}

/** A reference inside `(…)`: spaces and parentheses would end it. */
function escapeHref(href: string): string {
  return href.replaceAll(' ', '%20').replaceAll('(', '%28').replaceAll(')', '%29');
}

function opener(mark: Mark): string {
  return mark.type === 'link' ? '[' : mark.type === 'bold' ? '**' : '*';
}

function closer(mark: Mark): string {
  if (mark.type !== 'link') return opener(mark);
  return `](${escapeHref(mark.attrs.href)})`;
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

export interface NotionOptions {
  /** `##` by default: Notion has three heading levels, and the lesson's title takes the first. */
  headingLevel?: number;
  links?: LinkWriter;
  /** A reply: the whole body is a quote, its headings in bold. */
  quoted?: boolean;
  /** Markdown put before the first paragraph, or on a line of its own above anything else. */
  lead?: string;
  /** A line of Markdown after the body, in its quote for a reply (the section's tags). */
  after?: string;
}

/** One Notion block's worth of content, before it's written. */
type NotionItem =
  | { type: 'line'; text: string; quote: boolean }
  | { type: 'list'; lines: string[] }
  | { type: 'verse'; ref: VerseRef };

/**
 * A section body as Markdown that pastes into Notion with its structure (F33, M12-06): the blocks
 * Notion makes from a paste, separated by blank lines. Nothing is nested in a quote, since Notion
 * doesn't keep it: a reply or a quote is one level of quote, with its headings in bold and its
 * list items as "•" lines. Verse text is a quote of its own, the reference under it as a caption:
 * "> I am the door…" then "— John 10:9 (BSB)".
 */
export function toNotionBlocks(
  body: SectionBody,
  { headingLevel = 2, links, quoted = false, lead, after }: NotionOptions = {},
): string[] {
  const items: NotionItem[] = [];
  notionItems(body.content, { heading: '#'.repeat(headingLevel), links }, quoted, items);
  if (lead) {
    const first = items[0];
    if (first?.type === 'line' && body.content[0]?.type === 'paragraph') {
      first.text = `${lead} ${first.text}`;
    } else {
      items.unshift({ type: 'line', text: lead, quote: quoted });
    }
  }
  if (after) items.push({ type: 'line', text: after, quote: quoted });

  const blocks: string[] = [];
  let quote: string[] = [];
  const endQuote = () => {
    if (quote.length > 0) blocks.push(quote.join('\n>\n'));
    quote = [];
  };
  for (const item of items) {
    if (item.type === 'line' && item.quote) {
      quote.push(
        item.text
          .split('\n')
          .map((line) => `> ${line}`.trimEnd())
          .join('\n'),
      );
      continue;
    }
    endQuote();
    if (item.type === 'line') blocks.push(item.text);
    else if (item.type === 'list') blocks.push(item.lines.join('\n'));
    else {
      const text = escapeText(item.ref.snapshotText!.trim()).split(/\r?\n/);
      blocks.push(
        text.map((line) => `> ${line}`.trimEnd()).join('\n'),
        `— ${verseLabel(item.ref)}`,
      );
    }
  }
  endQuote();
  return blocks;
}

function notionItems(
  blocks: readonly Block[],
  context: Context,
  quote: boolean,
  items: NotionItem[],
): void {
  for (const block of blocks) {
    switch (block.type) {
      case 'paragraph':
      case 'heading': {
        const text = inlineToMarkdown(block.content ?? [], context.links);
        if (text) {
          const line =
            block.type === 'paragraph'
              ? escapeLineStart(text)
              : quote
                ? `**${text}**`
                : `${context.heading} ${text}`;
          items.push({ type: 'line', text: line, quote });
        }
        for (const node of block.content ?? []) {
          if (node.type === 'verse' && node.attrs.snapshotText) {
            items.push({ type: 'verse', ref: node.attrs });
          }
        }
        break;
      }
      case 'blockquote':
        notionItems(block.content, context, true, items);
        break;
      case 'bulletList':
      case 'orderedList': {
        const verses: NotionItem[] = [];
        const lines = notionList(block, 0, context, quote, verses);
        if (quote) for (const text of lines) items.push({ type: 'line', text, quote });
        else if (lines.length > 0) items.push({ type: 'list', lines });
        items.push(...verses);
        break;
      }
    }
  }
}

/**
 * A list's lines, its nested lists indented under their item; in a quote, "•" and "(1)" lines
 * that Notion keeps as text. The verses its items quote go after the list, in `verses`.
 */
function notionList(
  list: BulletList | OrderedList,
  nesting: number,
  context: Context,
  quote: boolean,
  verses: NotionItem[],
): string[] {
  const start = list.type === 'orderedList' ? (list.attrs?.start ?? 1) : 1;
  const indent = quote ? '' : '    '.repeat(nesting);
  return list.content.flatMap((item, i) => {
    const marker =
      list.type === 'bulletList'
        ? quote
          ? '• '
          : '- '
        : quote
          ? `(${start + i}) `
          : `${start + i}. `;
    const lines: string[] = [];
    for (const block of item.content) {
      if (block.type === 'bulletList' || block.type === 'orderedList') {
        lines.push(...notionList(block, nesting + 1, context, quote, verses));
        continue;
      }
      const inner: NotionItem[] = [];
      notionItems([block], context, true, inner);
      for (const entry of inner) {
        if (entry.type === 'verse') verses.push(entry);
        else if (entry.type === 'line') {
          lines.push(
            `${indent}${lines.length === 0 ? marker : ' '.repeat(marker.length)}${entry.text}`,
          );
        }
      }
    }
    return lines;
  });
}
