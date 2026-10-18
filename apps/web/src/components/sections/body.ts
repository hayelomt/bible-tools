import {
  type Block,
  type InlineNode,
  LINK_TARGET_TYPES,
  MAX_LINK_LABEL,
  type ListItem,
  type Mark,
  type Paragraph,
  type SectionBody,
  toPlainText,
  type VerseRef,
} from '@lamp/domain';
import type { JSONContent } from '@tiptap/core';

/**
 * TipTap's JSON as a section body (TECH-DESIGN §4.2). The editor only offers the nodes and marks
 * the body allows, but TipTap adds attributes of its own (a list's `type`, a link's `target` and
 * `rel`, nulls for unset verse fields), and the domain schema is strict. This keeps exactly what
 * the schema allows and drops anything else, such as a link that isn't http, https or mailto.
 */
export function toBody(json: JSONContent): SectionBody {
  const content = blocks(json.content);
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

/** Whether a body has anything in it worth storing: text, a verse chip or a link chip. */
export function hasText(body: SectionBody): boolean {
  return toPlainText(body).trim().length > 0;
}

const LINK = /^(https?:\/\/|mailto:)\S+$/i;
const VERSE_FIELDS = [
  'book',
  'chapter',
  'verseStart',
  'chapterEnd',
  'verseEnd',
  'display',
  'translation',
  'versionLabel',
  'snapshotText',
] as const satisfies readonly (keyof VerseRef)[];

function blocks(nodes: JSONContent[] | undefined): Block[] {
  return (nodes ?? []).flatMap((node) => {
    const b = block(node);
    return b ? [b] : [];
  });
}

function block(node: JSONContent): Block | null {
  switch (node.type) {
    case 'paragraph':
      return paragraph(node);
    case 'heading': {
      const content = inline(node.content);
      return { type: 'heading', attrs: { level: 3 }, ...(content.length > 0 && { content }) };
    }
    case 'bulletList':
    case 'orderedList': {
      const items = listItems(node.content);
      if (items.length === 0) return null;
      if (node.type === 'bulletList') return { type: 'bulletList', content: items };
      const start = Number(node.attrs?.start ?? 1);
      return {
        type: 'orderedList',
        // The default start is left out, so most stored lists carry no attributes.
        ...(Number.isInteger(start) && start >= 0 && start !== 1 && { attrs: { start } }),
        content: items,
      };
    }
    case 'blockquote': {
      const content = blocks(node.content);
      return content.length > 0 ? { type: 'blockquote', content } : null;
    }
    default:
      return null;
  }
}

function paragraph(node: JSONContent): Paragraph {
  const content = inline(node.content);
  return { type: 'paragraph', ...(content.length > 0 && { content }) };
}

function listItems(nodes: JSONContent[] | undefined): ListItem[] {
  return (nodes ?? []).flatMap((node): ListItem[] => {
    if (node.type !== 'listItem') return [];
    const [first, ...rest] = blocks(node.content);
    // ProseMirror's list item starts with a paragraph; anything else gets an empty one first.
    if (first?.type === 'paragraph') return [{ type: 'listItem', content: [first, ...rest] }];
    return [
      { type: 'listItem', content: [{ type: 'paragraph' }, ...(first ? [first] : []), ...rest] },
    ];
  });
}

function inline(nodes: JSONContent[] | undefined): InlineNode[] {
  return (nodes ?? []).flatMap((node): InlineNode[] => {
    if (node.type === 'text' && node.text) {
      const kept = marks(node.marks);
      return [{ type: 'text', text: node.text, ...(kept.length > 0 && { marks: kept }) }];
    }
    if (node.type === 'verse' && node.attrs) {
      const attrs = Object.fromEntries(
        VERSE_FIELDS.flatMap((key) => (node.attrs?.[key] == null ? [] : [[key, node.attrs[key]]])),
      );
      return [{ type: 'verse', attrs: attrs as unknown as VerseRef }];
    }
    if (node.type === 'noteLink' && node.attrs) {
      const { targetType, targetId, label } = node.attrs as Record<string, unknown>;
      const title = typeof label === 'string' ? label.trim().slice(0, MAX_LINK_LABEL) : '';
      if (
        !(LINK_TARGET_TYPES as readonly unknown[]).includes(targetType) ||
        typeof targetId !== 'string' ||
        !title
      ) {
        return [];
      }
      return [
        {
          type: 'noteLink',
          attrs: {
            targetType: targetType as (typeof LINK_TARGET_TYPES)[number],
            targetId,
            label: title,
          },
        },
      ];
    }
    return [];
  });
}

function marks(input: JSONContent['marks']): Mark[] {
  const kept = new Map<Mark['type'], Mark>();
  for (const mark of input ?? []) {
    if (mark.type === 'bold' || mark.type === 'italic') kept.set(mark.type, { type: mark.type });
    const href: unknown = mark.attrs?.href;
    if (
      mark.type === 'link' &&
      typeof href === 'string' &&
      href.length <= 2048 &&
      LINK.test(href)
    ) {
      kept.set('link', { type: 'link', attrs: { href } });
    }
  }
  return [...kept.values()];
}
