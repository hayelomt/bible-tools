import type { NoteLinkAttrs } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import type { LinkProps } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Ban } from 'lucide-react';
import { type LinkTarget, linkTarget } from '@/data/links.ts';

/**
 * A link chip (F23, wireframes/thinking.md "Link chip"): an arrow and the target's current title,
 * so a rename shows everywhere. A target deleted here keeps the title it last had, struck
 * through; one not on this device yet shows that title muted.
 */

/** The target as it is now, kept up to date; undefined while it's read. */
export function useLinkTarget(link: Pick<NoteLinkAttrs, 'targetType' | 'targetId'>) {
  const { targetType, targetId } = link;
  return useLiveQuery(
    () => linkTarget({ targetType, targetId, label: '' }),
    [targetType, targetId],
  );
}

/** Where a link opens: the lesson, or the lesson at the section, briefly highlighted. */
export function linkRoute(
  link: Pick<NoteLinkAttrs, 'targetType' | 'targetId'>,
  target?: LinkTarget,
): LinkProps {
  if (link.targetType === 'lesson') {
    return { to: '/lessons/$lessonId', params: { lessonId: link.targetId } };
  }
  const lessonId = target?.state === 'live' ? target.lesson.id : null;
  // A section not on this device opens the lesson screen's not-found state.
  return {
    to: '/lessons/$lessonId',
    params: { lessonId: lessonId ?? link.targetId },
    search: { section: link.targetId },
  };
}

/** What the chip says, and what screen readers hear. */
export function chipText(link: NoteLinkAttrs, target: LinkTarget | undefined) {
  const kind = link.targetType;
  if (target?.state === 'deleted') {
    return { text: link.label, label: `Broken link, ${link.label}, deleted.` };
  }
  const title = target?.state === 'live' ? target.title : link.label;
  return { text: title, label: `Link to ${kind} ${title}. Open.` };
}

export const LINK_CHIP_CLASS =
  'inline cursor-pointer rounded-md bg-muted px-1 font-sans text-[0.9em] hover:bg-accent [box-decoration-break:clone]';

/** The chip's face: `→ The Good Shepherd`, or `⊘ The Good Shepherd · deleted`. */
export function LinkChipFace({
  link,
  target,
}: {
  link: NoteLinkAttrs;
  target: LinkTarget | undefined;
}) {
  const { text } = chipText(link, target);
  if (target?.state === 'deleted') {
    return (
      <>
        <Ban aria-hidden className="mr-0.5 inline size-[0.85em] align-[-0.1em]" />
        <s>{text}</s>
        <span className="text-muted-foreground"> · deleted</span>
      </>
    );
  }
  return (
    <>
      <ArrowRight aria-hidden className="mr-0.5 inline size-[0.85em] align-[-0.1em]" />
      <span className={cn(target?.state !== 'live' && 'text-muted-foreground')}>{text}</span>
    </>
  );
}

interface BrokenLinkDialogProps {
  link: NoteLinkAttrs | null;
  onOpenChange: (open: boolean) => void;
  /** In a note: take the chip out, or put its title in its place as text. */
  onRemove?: () => void;
  onKeepText?: () => void;
}

/** A tap on a broken chip (wireframes/thinking.md): what happened, and what to do with it. */
export function BrokenLinkDialog({
  link,
  onOpenChange,
  onRemove,
  onKeepText,
}: BrokenLinkDialogProps) {
  return (
    <Dialog open={link !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Broken link</DialogTitle>
          <DialogDescription>
            {link?.label} was deleted. The link keeps the title it last had.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {onRemove && onKeepText ? (
            <>
              <Button variant="outline" onClick={onRemove}>
                Remove link
              </Button>
              <Button variant="outline" onClick={onKeepText}>
                Keep as text
              </Button>
            </>
          ) : (
            <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
