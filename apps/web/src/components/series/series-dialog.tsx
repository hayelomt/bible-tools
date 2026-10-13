import { type Series, SERIES_KINDS } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { Textarea } from '@lamp/ui/components/textarea';
import { useId, useState } from 'react';
import { createSeries, updateSeries } from '@/data/actions/series.ts';
import { SERIES_KIND_LABELS } from '@/lib/labels.ts';

interface SeriesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The series to edit; without one, the dialog creates a series. */
  series?: Series;
  onSaved?: (series: Series) => void;
}

/** Creates a series, or renames and describes one (wireframes/lessons.md "Series"). */
export function SeriesDialog({ open, onOpenChange, series, onSaved }: SeriesDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open, so each opening starts from the stored values. */}
        {open && <SeriesForm series={series} onOpenChange={onOpenChange} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function SeriesForm({ series, onOpenChange, onSaved }: Omit<SeriesDialogProps, 'open'>) {
  const [title, setTitle] = useState(series?.title ?? '');
  const [kind, setKind] = useState<Series['kind']>(series?.kind ?? 'sermon_series');
  const [description, setDescription] = useState(series?.description ?? '');
  const [missingTitle, setMissingTitle] = useState(false);
  const ids = { title: useId(), kind: useId(), description: useId(), error: useId() };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return setMissingTitle(true);
    const fields = { title, kind, description: description.trim() };
    const saved = series ? await updateSeries(series.id, fields) : await createSeries(fields);
    onOpenChange(false);
    onSaved?.(saved);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{series ? 'Edit series' : 'New series'}</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.title}>Name</Label>
        <Input
          id={ids.title}
          value={title}
          maxLength={200}
          required
          aria-invalid={missingTitle || undefined}
          aria-describedby={missingTitle ? ids.error : undefined}
          onChange={(event) => {
            setTitle(event.target.value);
            setMissingTitle(false);
          }}
        />
        {missingTitle && (
          <p id={ids.error} className="text-sm text-destructive">
            A series needs a name.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.kind}>Kind</Label>
        <NativeSelect
          id={ids.kind}
          value={kind}
          onChange={(event) => setKind(event.target.value as Series['kind'])}
        >
          {SERIES_KINDS.map((k) => (
            <option key={k} value={k}>
              {SERIES_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.description}>Description</Label>
        <Textarea
          id={ids.description}
          value={description}
          maxLength={5000}
          placeholder="Optional"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit">{series ? 'Save' : 'Create series'}</Button>
      </DialogFooter>
    </form>
  );
}
