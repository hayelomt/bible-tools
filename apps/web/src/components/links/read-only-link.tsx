import type { NoteLinkAttrs } from '@lamp/domain';
import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import {
  BrokenLinkDialog,
  chipText,
  LINK_CHIP_CLASS,
  LinkChipFace,
  linkRoute,
  useLinkTarget,
} from './link-chip.tsx';

/** A link chip in text that's read, not edited (the commentary): a link, or a broken chip. */
export function ReadOnlyLink({ link }: { link: NoteLinkAttrs }) {
  const target = useLinkTarget(link);
  const [broken, setBroken] = useState(false);
  const { label } = chipText(link, target);
  const className = `${LINK_CHIP_CLASS} outline-none focus-visible:ring-3 focus-visible:ring-ring/50`;
  if (target?.state === 'deleted') {
    return (
      <>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={label}
          data-slot="link-chip"
          className={className}
          onClick={() => setBroken(true)}
        >
          <LinkChipFace link={link} target={target} />
        </button>
        <BrokenLinkDialog link={broken ? link : null} onOpenChange={setBroken} />
      </>
    );
  }
  return (
    <Link
      {...linkRoute(link, target)}
      aria-label={label}
      data-slot="link-chip"
      className={className}
    >
      <LinkChipFace link={link} target={target} />
    </Link>
  );
}

/** A link chip on paper: its current title, or the one it last had, marked as deleted. */
export function PrintedLink({ link }: { link: NoteLinkAttrs }) {
  const target = useLinkTarget(link);
  const { text } = chipText(link, target);
  return (
    <span className="font-medium">
      → {text}
      {target?.state === 'deleted' && ' (deleted)'}
    </span>
  );
}
