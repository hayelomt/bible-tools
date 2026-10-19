import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { PageSection } from '@/components/page-section.tsx';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { setAccount, useAccount } from '@/lib/account.ts';
import { logout } from '@/lib/api.ts';
import { useDevices } from '@/lib/devices.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { count, maskEmail } from '@/lib/labels.ts';
import { useOnline } from '@/lib/use-online.ts';
import { unsyncedCount } from '@/sync/device-data.ts';
import { FormError, linkClass, OfflineNote } from './fields.tsx';

/**
 * Settings → Account (wireframes/shell.md "Settings"): an invitation for a guest, never a blocker.
 * Devices (M3-12) list the account's devices; account deletion joins it with M3-03's screen.
 */
export function AccountSection() {
  const account = useAccount().data;
  return (
    <PageSection title="Account">
      {account ? (
        <SignedIn userId={account.id} email={account.email} verified={!!account.emailVerifiedAt} />
      ) : (
        <Guest />
      )}
    </PageSection>
  );
}

function Guest() {
  // Signed out: the notes are still this account's, and sync when it signs in again (§6.6).
  const owner = useLiveQuery(async () => (await db.syncState.get(SYNC_STATE_KEY))?.ownerEmail, []);
  return (
    <>
      {owner ? (
        <p>
          Signed out. Your notes stay on this device, and changes sync the next time you sign in as{' '}
          {maskEmail(owner)}.
        </p>
      ) : (
        <p>
          Your notes are only on this device. Sign up to back them up and sync them to your other
          devices.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Link to="/signup" className={buttonVariants()}>
          Sign up
        </Link>
        <Link to="/signin" className={buttonVariants({ variant: 'outline' })}>
          Sign in
        </Link>
      </div>
    </>
  );
}

function SignedIn({
  userId,
  email,
  verified,
}: {
  userId: string;
  email: string;
  verified: boolean;
}) {
  const queryClient = useQueryClient();
  const devices = useDevices(userId).data;
  const online = useOnline();
  const [asking, setAsking] = useState(false);
  const unsynced = useLiveQuery(() => unsyncedCount(db), []) ?? 0;
  // Sign-out keeps the notes on the device (§6.6); the dialog says so, and what's waiting.
  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setAccount(queryClient, null);
      toast('Signed out. Your notes stay on this device.');
    },
  });
  return (
    <>
      <p className="break-all">
        {email} · {verified ? 'verified' : 'not verified'}
      </p>
      {!verified && (
        <Link to="/check-email" className={linkClass}>
          Verify your email ›
        </Link>
      )}
      <Link to="/settings/devices" className={linkClass}>
        Devices{devices?.length ? ` · ${count(devices.length, 'device')}` : ''} ›
      </Link>
      <Link to="/settings/shared-links" className={linkClass}>
        Shared links ›
      </Link>
      <Link to="/settings/password" className={linkClass}>
        Change password ›
      </Link>
      {!online && <OfflineNote />}
      <Button
        variant="outline"
        className="self-start"
        disabled={!online || signOut.isPending}
        onClick={() => setAsking(true)}
      >
        Sign out
      </Button>
      <FormError>{signOut.error && authErrorMessage(signOut.error)}</FormError>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title="Sign out?"
        description={
          unsynced > 0
            ? `Your notes stay on this device. ${count(unsynced, 'change')} ${unsynced === 1 ? "hasn't" : "haven't"} synced yet; they sync the next time you sign in here.`
            : 'Your notes stay on this device.'
        }
        confirmLabel="Sign out"
        variant="default"
        onConfirm={() => signOut.mutateAsync().catch(() => {})}
      />
    </>
  );
}
