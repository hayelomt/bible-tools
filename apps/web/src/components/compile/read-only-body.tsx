import {
  type Block,
  type InlineNode,
  type SectionBody,
  translationLabel,
  type VerseRef,
} from '@lamp/domain';
import { Marked } from '@/components/print/print-body.tsx';
import {
  CHIP_CLASS,
  chipLabel,
  hoverLeave,
  hoverOpen,
  openChip,
} from '@/components/verses/verse-chip.ts';

/**
 * A section body to read, not edit (the commentary, wireframes/thinking.md): its text as the
 * editor shows it, without a cursor or toolbar, so it can be selected and copied. Its verse chips
 * open in the viewer as they do in a note. Headings sit at `headingLevel`, under the group's.
 */
export function ReadOnlyBody({ body, headingLevel }: { body: SectionBody; headingLevel: 4 | 5 }) {
  return (
    <div className="flex flex-col gap-3 break-words">
      <Blocks blocks={body.content} headingLevel={headingLevel} />
    </div>
  );
}

function Blocks({ blocks, headingLevel }: { blocks: readonly Block[]; headingLevel: 4 | 5 }) {
  return blocks.map((block, i) => <BlockView key={i} block={block} headingLevel={headingLevel} />);
}

function BlockView({ block, headingLevel }: { block: Block; headingLevel: 4 | 5 }) {
  switch (block.type) {
    case 'paragraph': {
      if (!block.content?.length) return null;
      return (
        <p className="whitespace-pre-wrap">
          <Inline nodes={block.content} />
        </p>
      );
    }
    case 'heading': {
      if (!block.content?.length) return null;
      const Heading = headingLevel === 4 ? 'h4' : 'h5';
      return (
        <Heading className="text-base font-semibold">
          <Inline nodes={block.content} />
        </Heading>
      );
    }
    case 'blockquote':
      return (
        <blockquote className="flex flex-col gap-3 border-l-2 pl-4 text-muted-foreground">
          <Blocks blocks={block.content} headingLevel={headingLevel} />
        </blockquote>
      );
    case 'bulletList':
    case 'orderedList': {
      const List = block.type === 'bulletList' ? 'ul' : 'ol';
      return (
        <List
          className={block.type === 'bulletList' ? 'list-disc pl-6' : 'list-decimal pl-6'}
          start={block.type === 'orderedList' ? block.attrs?.start : undefined}
        >
          {block.content.map((item, i) => (
            <li key={i} className="pl-1 [&+&]:mt-1 [&>*+*]:mt-3">
              <Blocks blocks={item.content} headingLevel={headingLevel} />
            </li>
          ))}
        </List>
      );
    }
  }
}

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return nodes.map((node, i) =>
    node.type === 'verse' ? (
      <VerseChip key={i} verse={node.attrs} />
    ) : (
      <Marked key={i} text={node.text} marks={node.marks ?? []} />
    ),
  );
}

/** A verse chip as in a note: a tap, Enter or resting the mouse on it opens the viewer. */
function VerseChip({ verse }: { verse: VerseRef }) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-label={chipLabel(verse)}
      data-slot="verse-chip"
      className={`${CHIP_CLASS} outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
      onClick={(event) => openChip(null, event.currentTarget, verse)}
      onMouseEnter={(event) => hoverOpen(null, event.currentTarget, () => verse)}
      onMouseLeave={hoverLeave}
    >
      {verse.display} · {translationLabel(verse)}
    </button>
  );
}
