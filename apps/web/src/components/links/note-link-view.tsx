// A chip in the text being edited can't be a native link: focus stays in the editor, and the arrow
// keys select it (wireframes/thinking.md). It's read as a link, as the verse chip is a button.
/* oxlint-disable jsx-a11y/prefer-tag-over-role */
import type { NoteLinkAttrs } from '@lamp/domain';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { useNavigate } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import {
  BrokenLinkDialog,
  chipText,
  LINK_CHIP_CLASS,
  LinkChipFace,
  linkRoute,
  useLinkTarget,
} from './link-chip.tsx';

/**
 * How a `noteLink` node shows in a note (wireframes/thinking.md "Link chip"): a tap, or Enter once
 * the arrow keys have selected it, opens what it links to; a broken one asks what to do with it.
 * Backspace deletes it whole, as an atom.
 */
export function NoteLinkView({ node, editor, getPos, selected }: ReactNodeViewProps) {
  const link = node.attrs as NoteLinkAttrs;
  const target = useLinkTarget(link);
  const navigate = useNavigate();
  const [broken, setBroken] = useState(false);
  const { label } = chipText(link, target);

  function open() {
    if (target?.state === 'deleted') setBroken(true);
    else void navigate(linkRoute(link, target) as Parameters<typeof navigate>[0]);
  }

  /** Swaps the chip for `text` (nothing, or its title as plain text). */
  function replace(text: string) {
    setBroken(false);
    const pos = getPos();
    if (pos === undefined) return;
    const range = { from: pos, to: pos + node.nodeSize };
    const chain = editor.chain().focus();
    (text ? chain.insertContentAt(range, text) : chain.deleteRange(range)).run();
  }

  return (
    <NodeViewWrapper
      as="span"
      role="link"
      aria-label={label}
      data-slot="link-chip"
      data-broken={target?.state === 'deleted' || undefined}
      className={cn(LINK_CHIP_CLASS, selected && 'ring-2 ring-primary')}
      // Keep the cursor where it is; the click opens the link.
      onMouseDown={(event: React.MouseEvent) => event.preventDefault()}
      onClick={open}
    >
      <LinkChipFace link={link} target={target} />
      <BrokenLinkDialog
        link={broken ? link : null}
        onOpenChange={setBroken}
        onRemove={() => replace('')}
        onKeepText={() => replace(link.label)}
      />
    </NodeViewWrapper>
  );
}
