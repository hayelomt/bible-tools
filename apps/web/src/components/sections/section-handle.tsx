import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@lamp/ui/components/dropdown-menu';
import type { DraggableSyntheticListeners } from '@dnd-kit/core';
import { cn } from 'cn';
import { GripVertical } from 'lucide-react';
import { type RefObject, useState } from 'react';
import type { SectionListApi, SectionRow } from './section-list.tsx';

interface SectionHandleProps {
  row: SectionRow;
  api: SectionListApi;
  ref: RefObject<HTMLButtonElement | null>;
  /** dnd-kit's hold on the handle: pressing and moving it drags the section. */
  drag: { ref: (element: HTMLElement | null) => void; listeners: DraggableSyntheticListeners };
  /** Its section is the slot of a drag in progress. */
  hidden: boolean;
  /** Tags: opens the tag input under the section. */
  onEditTags: () => void;
}

/**
 * A section's `⠿` (wireframes/lessons.md, decided 2026-10-13): one control for both, so a phone
 * gives up a single 44 px gutter. A tap, a click or Enter opens the section menu; pressing and
 * dragging moves the section (`useSectionDrag`). The menu is the keyboard's way to reorder.
 */
export function SectionHandle({ row, api, ref, drag, hidden, onEditTags }: SectionHandleProps) {
  const [open, setOpen] = useState(false);
  const id = row.item.id;
  const can = open ? api.can(id) : undefined;
  // Base UI also returns focus when the rows move, long after the menu closed: only take it back
  // when the menu had it (Escape, a tap outside), never from an editor that has it now.
  const returnFocus = () => {
    const active = document.activeElement;
    const lost = !active || active === document.body || active.closest('[role="menu"]');
    return lost ? ref.current : false;
  };

  return (
    <>
      <Button
        ref={(element) => {
          ref.current = element;
          drag.ref(element);
        }}
        variant="ghost"
        size="icon"
        aria-label={row.level === 1 ? 'Reply actions' : 'Section actions'}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Drag to move, or click for actions"
        className={cn(
          'shrink-0 cursor-grab touch-pan-y text-muted-foreground select-none [-webkit-touch-callout:none] pointer-fine:opacity-0 pointer-fine:group-focus-within/section:opacity-100 pointer-fine:group-hover/section:opacity-100 pointer-fine:aria-expanded:opacity-100',
          hidden && 'invisible',
        )}
        {...drag.listeners}
        onClick={() => {
          // The click that ends a drag doesn't open the menu.
          if (!api.wasDragged()) setOpen(true);
        }}
      >
        <GripVertical />
      </Button>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuContent anchor={ref} align="end" finalFocus={returnFocus} className="w-48">
          {can && (
            <>
              <DropdownMenuItem onClick={() => api.reply(id)}>Reply</DropdownMenuItem>
              <DropdownMenuItem onClick={onEditTags}>Tags</DropdownMenuItem>
              <DropdownMenuItem disabled={!can.moveUp} onClick={() => api.moveUp(id, 'handle')}>
                Move up
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!can.moveDown} onClick={() => api.moveDown(id, 'handle')}>
                Move down
              </DropdownMenuItem>
              {row.level === 1 ? (
                <DropdownMenuItem onClick={() => api.outdent(id, 'handle')}>
                  Move out
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem disabled={!can.indent} onClick={() => api.indent(id, 'handle')}>
                  Make a reply
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => api.remove(id)}>
                {row.replies > 0 ? 'Delete…' : 'Delete'}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
