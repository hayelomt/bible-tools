import {
  type Block,
  type InlineNode,
  type Mark,
  refText,
  type SectionBody,
  type TextBlock,
  translationLabel,
  type VerseReader,
  type VerseRef,
} from '@lamp/domain';
import { createContext, type ReactNode, use } from 'react';
import { PrintedLink } from '@/components/links/read-only-link.tsx';

/**
 * A section body as a printed page shows it (F11, wireframes/export.md "Print view"), the way the
 * Markdown export writes it (decision 19): a verse chip reads "John 10:9 (BSB)" in the sentence,
 * and its text, read by `verses` (decision 97), is quoted in full after the paragraph. Headings
 * sit at `headingLevel`, one under the lesson's title.
 */
export function PrintBody({
  body,
  headingLevel,
  verses,
}: {
  body: SectionBody;
  headingLevel: 2 | 3;
  verses: VerseReader;
}) {
  return (
    <Verses value={verses}>
      <Blocks blocks={body.content} headingLevel={headingLevel} />
    </Verses>
  );
}

const Verses = createContext<VerseReader | null>(null);

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
  const reader = use(Verses)!;
  const nodes = block.content ?? [];
  const verses = nodes.flatMap((node) => {
    if (node.type !== 'verse') return [];
    const text = refText(node.attrs, reader).trim();
    return text ? [{ ref: node.attrs, text }] : [];
  });
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
      {verses.map(({ ref, text }, i) => (
        <VerseQuote key={i} verse={ref} text={text} />
      ))}
    </>
  );
}

/** "**John 10:9 (BSB)** I am the door…", quoted. */
function VerseQuote({ verse, text }: { verse: VerseRef; text: string }) {
  return (
    <blockquote className="border-l-2 border-neutral-300 pl-4 whitespace-pre-line text-neutral-700 break-inside-avoid">
      <strong className="font-semibold text-neutral-900">
        <VerseLabel verse={verse} />
      </strong>{' '}
      {text}
    </blockquote>
  );
}

function VerseLabel({ verse }: { verse: VerseRef }) {
  return `${verse.display} (${translationLabel(verse, use(Verses)!.translation)})`;
}

function Inline({ nodes }: { nodes: readonly InlineNode[] }) {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'verse':
        return (
          <span key={i} className="font-medium">
            <VerseLabel verse={node.attrs} />
          </span>
        );
      case 'noteLink':
        return <PrintedLink key={i} link={node.attrs} />;
      case 'text':
        return <Marked key={i} text={node.text} marks={node.marks ?? []} />;
    }
  });
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
