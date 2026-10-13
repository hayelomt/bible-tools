import { Button } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { setAccount, useAccount } from '@/lib/account.ts';
import { logout } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { count, maskEmail, notesSummary } from '@/lib/labels.ts';
import { useOnline } from '@/lib/use-online.ts';
import { noteCounts, unsyncedCount } from '@/sync/device-data.ts';
import type { OtherAccountChoice } from '@/sync/engine.ts';
import { syncEngine, useSyncStatus } from '@/sync/sync.ts';
import { FormError, OfflineNote } from './fields.tsx';

/**
 * "This device has notes from another account" (wireframes/account.md, §6.6): shown when someone
 * signs in on a device whose notes last synced with a different account, before anything syncs.
 * Removing them is the default; adding copies them into this account. Cancel signs out again.
 */
export function OtherAccountDialog() {
  const account = useAccount().data;
  const open = useSyncStatus().phase === 'other-account' && !!account;
  const info = useLiveQuery(
    async () =>
      open
        ? {
            owner: (await db.syncState.get(SYNC_STATE_KEY))?.ownerEmail ?? null,
            counts: await noteCounts(db),
            unsynced: await unsyncedCount(db),
          }
        : null,
    [open],
  );
  const [choice, setChoice] = useState<OtherAccountChoice>('remove');
  const queryClient = useQueryClient();
  const online = useOnline();
  const resolve = useMutation({
    mutationFn: () => syncEngine.resolveOtherAccount(choice),
    onSuccess: () =>
      toast(choice === 'add' ? 'Notes added to this account.' : 'Notes removed from this device.'),
  });
  const cancel = useMutation({
    mutationFn: logout,
    onSuccess: () => setAccount(queryClient, null),
  });
  if (!account || !info) return null;

  const owner = info.owner ? maskEmail(info.owner) : 'another account';
  const total = info.counts.lessons + info.counts.highlights + info.counts.memoryItems;
  const notes = total > 0 ? `${notesSummary(info.counts)} here` : 'The notes here';
  const choices: Array<{ value: OtherAccountChoice; label: string; hint: string }> = [
    {
      value: 'remove',
      label: 'Remove them from this device',
      hint: 'They stay in that account.',
    },
    {
      value: 'add',
      label: `Add them to ${maskEmail(account.email)}`,
      hint: "They're copied into this account.",
    },
  ];
  const busy = resolve.isPending || cancel.isPending;

  return (
    // Only the buttons close it: Escape or a tap outside would leave the choice unmade.
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>This device has notes from another account</DialogTitle>
          <DialogDescription>
            {notes} {total === 1 ? 'belongs' : 'belong'} to {owner}.
          </DialogDescription>
        </DialogHeader>
        <fieldset className="flex flex-col gap-1">
          <legend className="sr-only">What to do with them</legend>
          {choices.map(({ value, label, hint }) => (
            <label
              key={value}
              className="flex cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
            >
              <input
                type="radio"
                name="other-account"
                value={value}
                checked={choice === value}
                onChange={() => setChoice(value)}
                className="mt-1 accent-primary"
              />
              <span className="flex flex-col font-medium">
                {label}
                <span className="text-sm font-normal text-muted-foreground">{hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {info.unsynced > 0 && (
          <p role="alert" className="text-sm text-destructive">
            {count(info.unsynced, 'change')} from that account never synced. Removing them loses
            those changes; adding them copies them here instead.
          </p>
        )}
        {!online && <OfflineNote />}
        <FormError>
          {(cancel.error && authErrorMessage(cancel.error)) ||
            (resolve.error && "That didn't work. Try again.")}
        </FormError>
        <DialogFooter>
          <Button variant="outline" disabled={busy || !online} onClick={() => cancel.mutate()}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => resolve.mutate()}>
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
