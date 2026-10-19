import {
  type Block,
  type InlineNode,
  type Mark,
  type NoteLinkAttrs,
  refText,
  type SectionBody,
  type TextBlock,
  translationLabel,
  type VerseReader,
  type VerseRef,
} from '@lamp/domain';
import { type Html, markup } from './markup.js';

/**
 * A section body on a shared page, as the app's print view shows it (print-body.tsx): a verse chip
 * reads "John 10:9 (BSB)" in the sentence, and its text is quoted after the paragraph: the app's
 * own read by `verses` in the owner's translation (decision 97), text from outside as it came.
 */

/**
 * Where a link chip goes on this page: the address of what it points at when the link covers it,
 * or null, so it's its label as plain text (wireframes/sharing.md). Never the target's own title:
 * that's a row the link may not cover.
 */
export type ChipHref = (link: NoteLinkAttrs) => string | null;

export function bodyHtml(
  body: SectionBody,
  headingLevel: 2 | 3 | 4 | 5,
  href: ChipHref,
  verses: VerseReader,
): Html {
  return blocks(body.content, { headingLevel, href, verses });
}

interface Context {
  headingLevel: 2 | 3 | 4 | 5;
  href: ChipHref;
  verses: VerseReader;
}

function blocks(list: readonly Block[], context: Context): Html {
  return markup`${list.map((block) => blockHtml(block, context))}`;
}

function blockHtml(block: Block, context: Context): Html {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return textBlock(block, context);
    case 'blockquote':
      return markup`<blockquote>${blocks(block.content, context)}</blockquote>`;
    case 'bulletList':
      return markup`<ul>
        ${block.content.map((item) => markup`<li>${blocks(item.content, context)}</li>`)}
      </ul>`;
    case 'orderedList': {
      const start = block.attrs?.start;
      const items = block.content.map((item) => markup`<li>${blocks(item.content, context)}</li>`);
      return start !== undefined && start !== 1
        ? markup`<ol start="${start}">
            ${items}
          </ol>`
        : markup`<ol>
            ${items}
          </ol>`;
    }
  }
}

/** A paragraph or heading, then the text of each verse it cites. Empty ones show nothing. */
function textBlock(block: TextBlock, context: Context): Html {
  const nodes = block.content ?? [];
  if (nodes.length === 0) return markup``;
  const quotes = nodes.flatMap((node) => {
    if (node.type !== 'verse') return [];
    const text = refText(node.attrs, context.verses).trim();
    return text ? [verseQuote(node.attrs, text, context.verses)] : [];
  });
  const inner = inline(nodes, context);
  const line =
    block.type === 'heading' ? headingOf(context.headingLevel, inner) : markup`<p>${inner}</p>`;
  return markup`${line}${quotes}`;
}

function headingOf(level: Context['headingLevel'], inner: Html): Html {
  switch (level) {
    case 2:
      return markup`<h2>${inner}</h2>`;
    case 3:
      return markup`<h3>${inner}</h3>`;
    case 4:
      return markup`<h4>${inner}</h4>`;
    case 5:
      return markup`<h5>${inner}</h5>`;
  }
}

const verseLabel = (ref: VerseRef, verses: VerseReader) =>
  `${ref.display} (${translationLabel(ref, verses.translation)})`;

/** "**John 10:9 (BSB)** I am the door…", quoted. */
function verseQuote(ref: VerseRef, text: string, verses: VerseReader): Html {
  // On one line: the quote keeps its text's line breaks (`white-space: pre-line`).
  const label = markup`<strong>${verseLabel(ref, verses)}</strong>`;
  return markup`<blockquote class="verse-quote">${label} ${text}</blockquote>`;
}

function inline(nodes: readonly InlineNode[], { href, verses }: Context): Html {
  return markup`${nodes.map((node) => {
    switch (node.type) {
      case 'verse':
        return markup`<span class="chip">${verseLabel(node.attrs, verses)}</span>`;
      case 'noteLink': {
        const to = href(node.attrs);
        return to === null ? node.attrs.label : markup`<a href="${to}">${node.attrs.label}</a>`;
      }
      case 'text':
        return marked(node.text, node.marks ?? []);
    }
  })}`;
}

/** Text in its marks. A link's address is http(s) or mailto (`bodySchema`). */
function marked(text: string, marks: readonly Mark[]): Html {
  return marks.reduceRight<Html>(
    (inner, mark) => {
      if (mark.type === 'bold') return markup`<strong>${inner}</strong>`;
      if (mark.type === 'italic') return markup`<em>${inner}</em>`;
      return markup`<a href="${mark.attrs.href}" rel="noopener noreferrer nofollow">${inner}</a>`;
    },
    markup`${text}`,
  );
}
