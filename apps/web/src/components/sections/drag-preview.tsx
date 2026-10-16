import { GripVertical } from 'lucide-react';
import type { SectionRow } from './section-list.tsx';

interface DragPreviewProps {
  row: SectionRow;
  /** The section's text, as it is now (its editor may not have stored it yet). */
  text: string;
  /** The level it would land at. */
  level: 0 | 1;
}

/**
 * The card that follows the pointer while a section is dragged: the start of its text and how
 * many replies go with it. It has a shadow, so it reads as held, not as a row.
 */
export function DragPreview({ row, text, level }: DragPreviewProps) {
  const replies = row.replies;
  return (
    <div className="flex cursor-grabbing items-start gap-1 rounded-lg bg-card shadow-xl ring-1 ring-primary/40">
      <div className="min-w-0 flex-1 border-l-2 border-primary py-2 pl-3">
        <p className="text-xs font-medium text-primary">{level === 1 ? 'Reply' : 'Note'}</p>
        <p className="line-clamp-3 text-[17px] leading-[1.6]">
          {text.trim() || <span className="text-muted-foreground">Empty</span>}
        </p>
        {replies > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">
            + {replies === 1 ? '1 reply' : `${replies} replies`}
          </p>
        )}
      </div>
      <div className="flex size-8 shrink-0 items-center justify-center text-primary pointer-coarse:size-11">
        <GripVertical className="size-4" />
      </div>
    </div>
  );
}
