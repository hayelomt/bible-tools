import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { PageSection } from '@/components/page-section.tsx';
import { setAccount, useAccount } from '@/lib/account.ts';
import { logout } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';
import { FormError, linkClass, OfflineNote } from './fields.tsx';

/**
 * Settings → Account (wireframes/shell.md "Settings"): an invitation for a guest, never a blocker.
 * Devices and account deletion join it with M3-12 and M3-03's screen.
 */
export function AccountSection() {
  const account = useAccount().data;
  return (
    <PageSection title="Account">
      {account ? (
        <SignedIn email={account.email} verified={!!account.emailVerifiedAt} />
      ) : (
        <Guest />
      )}
    </PageSection>
  );
}

function Guest() {
  return (
    <>
      <p>
        Your notes are only on this device. Sign up to back them up and sync them to your other
        devices.
      </p>
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

function SignedIn({ email, verified }: { email: string; verified: boolean }) {
  const queryClient = useQueryClient();
  const online = useOnline();
  // Sign-out keeps the notes on the device (§6.6). M3-10 adds the dialog for unsynced changes.
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
      <Link to="/settings/password" className={linkClass}>
        Change password ›
      </Link>
      {!online && <OfflineNote />}
      <Button
        variant="outline"
        className="self-start"
        disabled={!online || signOut.isPending}
        onClick={() => signOut.mutate()}
      >
        Sign out
      </Button>
      <FormError>{signOut.error && authErrorMessage(signOut.error)}</FormError>
    </>
  );
}
