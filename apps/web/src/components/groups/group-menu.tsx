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
import { Label } from '@lamp/ui/components/label';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { useMutation } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { Ellipsis } from 'lucide-react';
import { useId, useState } from 'react';
import { Field, FormError, OfflineNote } from '@/components/account/fields.tsx';
import { seriesForGroup } from '@/data/groups.ts';
import { addGroupSeries, renameGroup } from '@/lib/api.ts';
import { afterGroupChange, groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';
import { LeaveGroupDialog } from './leave-group-dialog.tsx';

interface GroupMenuProps {
  groupId: string;
  name: string;
  owner: boolean;
  /** How many members, for what leaving does. */
  members: number;
}

/** The group page's `⋯` (wireframes/sharing.md): Rename and Add a series (owner), Leave. */
export function GroupMenu({ groupId, name, owner, members }: GroupMenuProps) {
  const [dialog, setDialog] = useState<'rename' | 'series' | 'leave' | null>(null);
  const close = (open: boolean) => !open && setDialog(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" aria-label="Group actions" />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {owner && (
            <>
              <DropdownMenuItem onClick={() => setDialog('rename')}>Rename…</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setDialog('series')}>Add a series…</DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDialog('leave')}>
            Leave group…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialog === 'rename'} onOpenChange={close}>
        <DialogContent>
          {dialog === 'rename' && (
            <RenameForm groupId={groupId} name={name} onDone={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === 'series'} onOpenChange={close}>
        <DialogContent>
          {dialog === 'series' && (
            <AddSeriesForm groupId={groupId} onDone={() => setDialog(null)} />
          )}
        </DialogContent>
      </Dialog>
      <LeaveGroupDialog
        open={dialog === 'leave'}
        onOpenChange={close}
        groupId={groupId}
        name={name}
        owner={owner}
        members={members}
      />
    </>
  );
}

function RenameForm({
  groupId,
  name,
  onDone,
}: {
  groupId: string;
  name: string;
  onDone: () => void;
}) {
  const online = useOnline();
  const [value, setValue] = useState(name);
  const rename = useMutation({
    mutationFn: () => renameGroup(groupId, value.trim()),
    onSuccess: async () => {
      onDone();
      await afterGroupChange();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (value.trim()) rename.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Rename the group</DialogTitle>
      </DialogHeader>
      <Field label="Name" value={value} maxLength={80} onChange={(e) => setValue(e.target.value)} />
      <FormError>{rename.error && groupErrorMessage(rename.error)}</FormError>
      {!online && <OfflineNote />}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!online || !value.trim() || rename.isPending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddSeriesForm({ groupId, onDone }: { groupId: string; onDone: () => void }) {
  const online = useOnline();
  const free = useLiveQuery(() => seriesForGroup(), []);
  const [chosen, setChosen] = useState('');
  const id = useId();
  const series = chosen || free?.[0]?.id || '';
  const add = useMutation({
    mutationFn: () => addGroupSeries(groupId, series),
    onSuccess: async () => {
      onDone();
      await afterGroupChange();
    },
  });
  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (series) add.mutate();
      }}
    >
      <DialogHeader>
        <DialogTitle>Add a series</DialogTitle>
      </DialogHeader>
      {free && free.length === 0 ? (
        <p>Every series of yours is in a group already. Each series can be in one group.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor={id}>Series</Label>
          <NativeSelect id={id} value={series} onChange={(e) => setChosen(e.target.value)}>
            {free?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </NativeSelect>
          <p className="text-sm text-muted-foreground">
            Members see its lessons. Your notes in them stay private.
          </p>
        </div>
      )}
      <FormError>{add.error && groupErrorMessage(add.error)}</FormError>
      {!online && <OfflineNote />}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!online || !series || add.isPending}>
          Add series
        </Button>
      </DialogFooter>
    </form>
  );
}
