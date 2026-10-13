import type { Device } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { FormError } from '@/components/account/fields.tsx';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { setAccount, useAccount } from '@/lib/account.ts';
import { ApiRequestError, NetworkError, signOutDevice } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { agoLabel } from '@/lib/dates.ts';
import { forgetDevice, useDevices } from '@/lib/devices.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/settings/devices')({
  staticData: { title: 'Devices', back: '/settings' },
  component: Devices,
});

/**
 * wireframes/account.md "Devices": the devices signed in to the account, this one first, each with
 * its last sync and version; the others can be signed out (§6.6). Offline, the last copy shows.
 */
function Devices() {
  const account = useAccount().data;
  const online = useOnline();
  const devices = useDevices(account?.id);
  const thisDevice = useLiveQuery(async () => (await db.syncState.get(SYNC_STATE_KEY))?.deviceId);

  if (!account) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Sign in to see the devices that sync your notes.</p>
        <Link to="/signin" className={buttonVariants({ variant: 'outline' })}>
          Sign in
        </Link>
      </div>
    );
  }

  const list = devices.data;
  const unreachable = !online || devices.error instanceof NetworkError;
  if (!list) {
    if (unreachable) return <p className="text-muted-foreground">The list needs a connection.</p>;
    if (devices.error) {
      return (
        <div className="flex flex-col items-start gap-4">
          <p>Your devices couldn't be loaded.</p>
          <Button variant="outline" onClick={() => void devices.refetch()}>
            Try again
          </Button>
        </div>
      );
    }
    return null;
  }

  // This device first; it signs out from Settings, not from here.
  const ordered = list.toSorted(
    (a, b) => Number(b.id === thisDevice) - Number(a.id === thisDevice),
  );
  return (
    <div className="flex flex-col gap-4">
      {unreachable && (
        <p className="text-sm text-muted-foreground">Needs a connection to update.</p>
      )}
      {ordered.length === 0 ? (
        <p className="text-muted-foreground">No device has synced yet.</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {ordered.map((device) => (
            <DeviceRow
              key={device.id}
              device={device}
              userId={account.id}
              current={device.id === thisDevice}
              online={online}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface DeviceRowProps {
  device: Device;
  userId: string;
  current: boolean;
  online: boolean;
}

function DeviceRow({ device, userId, current, online }: DeviceRowProps) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const signOut = useMutation({
    mutationFn: () => signOutDevice(device.id),
    onSuccess: async () => {
      toast(`${device.name} is signed out.`);
      await forgetDevice(queryClient, userId, device.id);
    },
    onError: async (error) => {
      // This session ended meanwhile; or the device was already signed out.
      if (error instanceof ApiRequestError && error.status === 401) setAccount(queryClient, null);
      if (error instanceof ApiRequestError && error.status === 404) {
        await forgetDevice(queryClient, userId, device.id);
      }
    },
  });
  const synced = device.lastSyncAt
    ? `Last synced ${agoLabel(device.lastSyncAt)}`
    : 'Not synced yet';
  return (
    <li
      className="flex flex-col gap-1 py-3"
      aria-label={current ? `This device: ${device.name}` : device.name}
    >
      {current && <p className="text-sm font-medium text-muted-foreground">This device</p>}
      <p className="font-medium">{device.name}</p>
      <p className="text-sm text-muted-foreground">
        {synced} · Lamp {device.clientVersion}
      </p>
      {!current && (
        <Button
          variant="outline"
          size="sm"
          className="self-end"
          disabled={!online || signOut.isPending}
          onClick={() => setAsking(true)}
        >
          Sign out
        </Button>
      )}
      <FormError>
        {signOut.error &&
        !(signOut.error instanceof ApiRequestError && signOut.error.status === 404)
          ? authErrorMessage(signOut.error)
          : null}
      </FormError>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Sign out ${device.name}?`}
        description="Its notes stay on it, and it stops syncing until someone signs in there again."
        confirmLabel="Sign out"
        variant="default"
        onConfirm={() => signOut.mutateAsync().catch(() => {})}
      />
    </li>
  );
}
