import type { Lesson } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { MoveToSeriesDialog } from '@/components/series/move-to-series-dialog.tsx';
import { deleteLesson } from '@/data/actions/lessons.ts';
import { sectionCount } from '@/data/queries.ts';
import { count } from '@/lib/labels.ts';

/** The lesson's `⋯` (wireframes/lessons.md): Move to series and Delete lesson; Export is M6. */
export function LessonMenu({ lesson }: { lesson: Lesson }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null);
  const sections = useLiveQuery(() => sectionCount(lesson.id), [lesson.id]) ?? 0;
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Lesson actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDialog('move')}>Move to series…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
            Delete lesson…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <MoveToSeriesDialog lesson={lesson} open={dialog === 'move'} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title={`Delete the lesson “${lesson.title}”?`}
        description={
          sections > 0
            ? `Its ${count(sections, 'section')}, takeaways and questions are deleted too.`
            : 'This can’t be undone.'
        }
        confirmLabel="Delete lesson"
        onConfirm={async () => {
          await deleteLesson(lesson.id);
          await navigate({ to: '/', replace: true });
        }}
      />
    </>
  );
}
