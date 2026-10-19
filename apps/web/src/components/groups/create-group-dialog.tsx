import { Button, buttonVariants } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Label } from '@lamp/ui/components/label';
import { NativeSelect } from '@lamp/ui/components/native-select';
import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useId, useState } from 'react';
import { Field, FormError, OfflineNote } from '@/components/account/fields.tsx';
import { seriesForGroup } from '@/data/groups.ts';
import { useAccount } from '@/lib/account.ts';
import { createGroup } from '@/lib/api.ts';
import { afterGroupChange, groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The series to study, from its `⋯`; otherwise the first one free. */
  seriesId?: string;
}

/** wireframes/sharing.md "Groups" → Create: a name, a series and the user's name in the group. */
export function CreateGroupDialog({ open, onOpenChange, seriesId }: CreateGroupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <CreateGroupForm seriesId={seriesId} onOpenChange={onOpenChange} />}
      </DialogContent>
    </Dialog>
  );
}

function CreateGroupForm({ seriesId, onOpenChange }: Omit<CreateGroupDialogProps, 'open'>) {
  const account = useAccount().data;
  const online = useOnline();
  const navigate = useNavigate();
  const free = useLiveQuery(() => seriesForGroup(), []);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState(seriesId ?? '');
  const [displayName, setDisplayName] = useState('');
  const [missing, setMissing] = useState<{ name?: boolean; displayName?: boolean }>({});
  const seriesFieldId = useId();
  const series = chosen || free?.[0]?.id || '';
  const title = free?.find((s) => s.id === series)?.title;
  const create = useMutation({
    mutationFn: () =>
      createGroup({ name: name.trim(), seriesId: series, displayName: displayName.trim() }),
    onSuccess: async (groupId) => {
      onOpenChange(false);
      await afterGroupChange();
      void navigate({ to: '/groups/$groupId', params: { groupId } });
    },
  });

  const header = (
    <DialogHeader>
      <DialogTitle>New group</DialogTitle>
      {!account && (
        <DialogDescription>
          Sign in to start a group. Your notes are on this device only, so there’s nothing for a
          group to share yet.
        </DialogDescription>
      )}
    </DialogHeader>
  );
  if (!account) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Link to="/signin" className={buttonVariants()} onClick={() => onOpenChange(false)}>
            Sign in
          </Link>
        </DialogFooter>
      </div>
    );
  }
  if (free && free.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <p>
          A group studies a series. Make a series of your lessons first; each series can be in one
          group.
        </p>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = { name: !name.trim(), displayName: !displayName.trim() };
    setMissing(found);
    if (!found.name && !found.displayName && series) create.mutate();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {header}
      <Field
        label="Name"
        value={name}
        maxLength={80}
        placeholder="Thursday group"
        error={missing.name ? 'A group needs a name.' : undefined}
        onChange={(event) => {
          setName(event.target.value);
          setMissing((m) => ({ ...m, name: false }));
        }}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor={seriesFieldId}>Series</Label>
        <NativeSelect
          id={seriesFieldId}
          value={series}
          onChange={(event) => setChosen(event.target.value)}
        >
          {free?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Field
        label="Your name in this group"
        value={displayName}
        maxLength={40}
        autoComplete="nickname"
        hint="What members see. They never see your email."
        error={missing.displayName ? 'Members need a name to know you by.' : undefined}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setMissing((m) => ({ ...m, displayName: false }));
        }}
      />
      <p className="text-sm text-muted-foreground">
        Members will see the lessons in {title ?? 'the series'} and what’s added to their group
        thread. Your own notes stay private.
      </p>
      <FormError>{create.error && groupErrorMessage(create.error)}</FormError>
      {!online && <OfflineNote />}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" disabled={!online || create.isPending || !series}>
          {create.isPending ? 'Creating…' : 'Create'}
        </Button>
      </DialogFooter>
    </form>
  );
}
