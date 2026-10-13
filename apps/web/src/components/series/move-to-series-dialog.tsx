import type { Lesson } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@lamp/ui/components/dialog';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus } from 'lucide-react';
import { useState } from 'react';
import { updateLesson } from '@/data/actions/lessons.ts';
import { allSeries } from '@/data/queries.ts';
import { SeriesDialog } from './series-dialog.tsx';

interface MoveToSeriesDialogProps {
  lesson: Lesson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * "Move to series" from the lesson's `⋯` (wireframes/lessons.md "Series"): every series with the
 * current one ticked, "No series" and "+ New series". A choice moves the lesson at once.
 */
export function MoveToSeriesDialog({ lesson, open, onOpenChange }: MoveToSeriesDialogProps) {
  const series = useLiveQuery(() => allSeries(), []);
  const [creating, setCreating] = useState(false);

  async function move(seriesId: string | null) {
    if (seriesId !== lesson.seriesId) await updateLesson(lesson.id, { seriesId });
    onOpenChange(false);
  }

  const choices = [{ id: null, title: 'No series' }, ...(series ?? [])];
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move to series</DialogTitle>
          </DialogHeader>
          <fieldset className="flex flex-col">
            <legend className="sr-only">Series</legend>
            {choices.map(({ id, title }) => (
              <label
                key={id ?? 'none'}
                className="relative flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 has-checked:font-medium has-focus-visible:ring-3 has-focus-visible:ring-ring/50 hover:bg-muted pointer-coarse:min-h-11"
              >
                <input
                  type="radio"
                  name="move-to-series"
                  checked={lesson.seriesId === id}
                  onChange={() => void move(id)}
                  className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                />
                <span className="min-w-0 break-words">{title}</span>
                {lesson.seriesId === id && <Check className="size-4 shrink-0" aria-hidden />}
              </label>
            ))}
          </fieldset>
          <Button variant="outline" className="self-start" onClick={() => setCreating(true)}>
            <Plus aria-hidden />
            New series
          </Button>
        </DialogContent>
      </Dialog>
      <SeriesDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(created) => void move(created.id)}
      />
    </>
  );
}
