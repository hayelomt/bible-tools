import { MAX_TAG_NAME_LENGTH, normaliseTagName, type Tag } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import { useNavigate } from '@tanstack/react-router';
import { Ellipsis } from 'lucide-react';
import { useId, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { deleteTag, renameTag, TagNameTakenError } from '@/data/actions/tags.ts';
import { count } from '@/lib/labels.ts';

interface TagMenuProps {
  tag: Tag;
  /** How many sections and lessons have the tag, for the delete confirmation. */
  uses: number;
}

/** The tag page's `⋯` (wireframes/lessons.md "Tag page"): Rename tag and Delete tag. */
export function TagMenu({ tag, uses }: TagMenuProps) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Tag actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setDialog('rename')}>Rename tag…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('delete')}>
            Delete tag…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === 'rename'} onOpenChange={close}>
        <DialogContent>
          {/* Mounted only while open, so each opening starts from the stored name. */}
          {dialog === 'rename' && <RenameForm tag={tag} onDone={() => setDialog(null)} />}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={close}
        title={`Delete the tag #${tag.name}?`}
        description={
          uses > 0 ? `It comes off ${count(uses, 'note')}; the notes stay.` : 'No notes have it.'
        }
        confirmLabel="Delete tag"
        onConfirm={async () => {
          await deleteTag(tag.id);
          await navigate({ to: '/', replace: true });
        }}
      />
    </>
  );
}

function RenameForm({ tag, onDone }: { tag: Tag; onDone: () => void }) {
  const [name, setName] = useState(tag.name);
  const [error, setError] = useState<string | null>(null);
  const ids = { name: useId(), error: useId() };

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!normaliseTagName(name)) return setError('A tag needs a name.');
    try {
      await renameTag(tag.id, name);
      onDone();
    } catch (caught) {
      if (!(caught instanceof TagNameTakenError)) throw caught;
      // Tags aren't merged: the user picks another name, or tags the notes with the other one.
      setError(`There’s already a tag #${caught.existing.name}.`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Rename tag</DialogTitle>
      </DialogHeader>
      <div className="flex flex-col gap-2">
        <Label htmlFor={ids.name}>Name</Label>
        <Input
          id={ids.name}
          value={name}
          maxLength={MAX_TAG_NAME_LENGTH + 1}
          required
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? ids.error : undefined}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        {error && (
          <p id={ids.error} className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
        <Button type="submit">Rename</Button>
      </DialogFooter>
    </form>
  );
}
