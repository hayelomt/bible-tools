import type { Series } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { useNavigate } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { deleteSeries } from '@/data/actions/series.ts';
import { count } from '@/lib/labels.ts';
import { SeriesDialog } from './series-dialog.tsx';

/** The series' `⋯` (wireframes/lessons.md "Series"): Edit and Delete; Export is M6. */
export function SeriesMenu({ series, lessonCount }: { series: Series; lessonCount: number }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Series actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDialog('edit')}>Edit series…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
            Delete series…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SeriesDialog series={series} open={dialog === 'edit'} onOpenChange={close} />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title={`Delete the series ${series.title}?`}
        description={
          lessonCount > 0
            ? `Its ${count(lessonCount, 'lesson')} ${lessonCount === 1 ? 'stays' : 'stay'}, without a series.`
            : 'It has no lessons.'
        }
        confirmLabel="Delete series"
        onConfirm={async () => {
          await deleteSeries(series.id);
          await navigate({ to: '/', replace: true });
        }}
      />
    </>
  );
}
