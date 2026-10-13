import { verifyEmailRequestSchema } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { FormError, OfflineNote } from '@/components/account/fields.tsx';
import { noteVerificationSent, refreshAccount, useAccount } from '@/lib/account.ts';
import { ApiRequestError, NetworkError, resendVerification, verifyEmail } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/verify-email')({
  staticData: { title: 'Verify your email', back: '/settings' },
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: VerifyEmail,
});

/**
 * The verification link's page (wireframes/account.md "Check your email, and verify"). It needs
 * no session: the link may be opened on any device. M3-09 adds the first backup's progress.
 */
function VerifyEmail() {
  const { token = '' } = Route.useSearch();
  const wellFormed = verifyEmailRequestSchema.safeParse({ token }).success;
  const account = useAccount().data;
  const queryClient = useQueryClient();
  const online = useOnline();
  // A query rather than a mutation: it runs once per token, even when React mounts twice, and
  // again when the device comes back online.
  const verify = useQuery({
    queryKey: ['verify-email', token],
    queryFn: async () => {
      await verifyEmail({ token });
      await refreshAccount(queryClient);
      return true;
    },
    enabled: wellFormed,
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (verify.isSuccess || (verify.isError && account?.emailVerifiedAt)) return <Verified />;

  if (verify.error instanceof NetworkError) {
    return (
      <div className="flex flex-col items-start gap-4">
        {online ? <FormError>{authErrorMessage(verify.error)}</FormError> : <OfflineNote />}
        <Button variant="outline" disabled={!online} onClick={() => void verify.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const invalid =
    !wellFormed ||
    (verify.error instanceof ApiRequestError && verify.error.errorCode === 'TOKEN_INVALID');
  if (invalid) return <ExpiredLink signedIn={!!account} />;
  if (verify.isError) return <FormError>{authErrorMessage(verify.error)}</FormError>;
  return <output>Verifying your email…</output>;
}

function Verified() {
  return (
    <div className="flex flex-col items-start gap-4">
      <output>Email verified.</output>
      <Link to="/" className={buttonVariants({ size: 'lg' })}>
        Go to your lessons
      </Link>
    </div>
  );
}

/** A new link needs the account's session, since the address comes from it (§7.3). */
function ExpiredLink({ signedIn }: { signedIn: boolean }) {
  const navigate = useNavigate();
  const online = useOnline();
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => {
      noteVerificationSent();
      void navigate({ to: '/check-email' });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.errorCode === 'RESEND_TOO_SOON') {
        noteVerificationSent(error.retryAfterSeconds);
        void navigate({ to: '/check-email' });
      }
    },
  });
  return (
    <div className="flex flex-col items-start gap-4">
      <p>This link has expired or was already used.</p>
      {signedIn ? (
        <>
          {!online && <OfflineNote />}
          <Button
            variant="outline"
            disabled={!online || resend.isPending}
            onClick={() => resend.mutate()}
          >
            Send a new link
          </Button>
          <FormError>{resend.error && authErrorMessage(resend.error)}</FormError>
        </>
      ) : (
        <>
          <p>Sign in on this device to get a new link.</p>
          <Link to="/signin" className={buttonVariants({ variant: 'outline' })}>
            Sign in
          </Link>
        </>
      )}
    </div>
  );
}
