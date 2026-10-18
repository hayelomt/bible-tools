import {
  type Block,
  type InlineNode,
  type Mark,
  type SectionBody,
  type TextBlock,
  translationLabel,
  type VerseRef,
} from '@lamp/domain';
import type { ReactNode } from 'react';

/**
 * A section body as a printed page shows it (F11, wireframes/export.md "Print view"), the way the
 * Markdown export writes it (decision 19): a verse chip reads "John 10:9 (BSB)" in the sentence,
 * and its text is quoted in full after the paragraph. Headings sit at `headingLevel`, one under
 * the lesson's title.
 */
export function PrintBody({ body, headingLevel }: { body: SectionBody; headingLevel: 2 | 3 }) {
  return <Blocks blocks={body.content} headingLevel={headingLevel} />;
}

function Blocks({ blocks, headingLevel }: { blocks: readonly Block[]; headingLevel: 2 | 3 }) {
  return blocks.map((block, i) => <BlockView key={i} block={block} headingLevel={headingLevel} />);
}

function BlockView({ block, headingLevel }: { block: Block; headingLevel: 2 | 3 }) {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
      return <TextBlockView block={block} headingLevel={headingLevel} />;
    case 'blockquote':
      return (
        <blockquote className="flex flex-col gap-3 border-l-2 border-neutral-300 pl-4">
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

/** A paragraph or heading, then the text of each verse it cites. Empty ones print nothing. */
function TextBlockView({ block, headingLevel }: { block: TextBlock; headingLevel: 2 | 3 }) {
  const nodes = block.content ?? [];
  const verses = nodes.flatMap((node) =>
    node.type === 'verse' && node.attrs.snapshotText ? [node.attrs] : [],
  );
  if (nodes.length === 0) return null;
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  return (
    <>
      {block.type === 'heading' ? (
        <Heading className="text-lg font-semibold break-after-avoid">
          <Inline nodes={nodes} />
        </Heading>
      ) : (
        <p className="break-words whitespace-pre-wrap">
          <Inline nodes={nodes} />
        </p>
      )}
      {verses.map((ref, i) => (
        <VerseQuote key={i} verse={ref} />
      ))}
    </>
  );
}

/** "**John 10:9 (BSB)** I am the door…", quoted. */
function VerseQuote({ verse }: { verse: VerseRef }) {
  return (
    <blockquote className="border-l-2 border-neutral-300 pl-4 whitespace-pre-line text-neutral-700 break-inside-avoid">
      <strong className="font-semibold text-neutral-900">{verseLabel(verse)}</strong>{' '}
      {verse.snapshotText!.trim()}
    </blockquote>
  );
}

function verseLabel(ref: VerseRef): string {
  return `${ref.display} (${translationLabel(ref)})`;
}

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return nodes.map((node, i) =>
    node.type === 'verse' ? (
      <span key={i} className="font-medium">
        {verseLabel(node.attrs)}
      </span>
    ) : (
      <Marked key={i} text={node.text} marks={node.marks ?? []} />
    ),
  );
}

export function Marked({ text, marks }: { text: string; marks: readonly Mark[] }): ReactNode {
  return marks.reduceRight<ReactNode>((inner, mark) => {
    if (mark.type === 'bold') return <strong className="font-semibold">{inner}</strong>;
    if (mark.type === 'italic') return <em>{inner}</em>;
    return (
      <a href={mark.attrs.href} className="underline underline-offset-2">
        {inner}
      </a>
    );
  }, text);
}
