import { Button, buttonVariants } from '@lamp/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { FormError, linkClass, OfflineNote } from '@/components/account/fields.tsx';
import {
  noteVerificationSent,
  refreshAccount,
  resendWait,
  setAccount,
  useAccount,
} from '@/lib/account.ts';
import { ApiRequestError, logout, resendVerification } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/check-email')({
  staticData: { title: 'Check your email', back: '/settings' },
  component: CheckEmail,
});

/** Seconds until "Send it again", rendered again each second while there are any. */
function useResendWait(): number {
  const [, tick] = useState(0);
  const wait = resendWait();
  useEffect(() => {
    if (wait === 0) return;
    const timer = setTimeout(() => tick((n) => n + 1), 1000);
    return () => clearTimeout(timer);
  });
  return wait;
}

/**
 * After sign-up, and from Settings while the email isn't verified (wireframes/account.md). The
 * account is asked for again when the page regains focus, so a link opened on another device shows
 * here.
 */
function CheckEmail() {
  const account = useAccount().data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const wait = useResendWait();
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => noteVerificationSent(),
    onError: (error) => {
      if (!(error instanceof ApiRequestError)) return;
      if (error.errorCode === 'RESEND_TOO_SOON') noteVerificationSent(error.retryAfterSeconds);
      if (error.errorCode === 'ALREADY_VERIFIED') void refreshAccount(queryClient);
    },
  });
  const startAgain = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      setAccount(queryClient, null);
      void navigate({ to: '/signup' });
    },
  });

  if (!account) {
    return (
      <div className="flex flex-col gap-4">
        <p>Sign in to verify your email.</p>
        <Link
          to="/signin"
          className={buttonVariants({ variant: 'outline', className: 'self-start' })}
        >
          Sign in
        </Link>
      </div>
    );
  }

  if (account.emailVerifiedAt) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Your email is verified.</p>
        <Link to="/" className={buttonVariants({ size: 'lg' })}>
          Go to your lessons
        </Link>
      </div>
    );
  }

  const tooSoon =
    resend.error instanceof ApiRequestError && resend.error.errorCode === 'RESEND_TOO_SOON';

  return (
    <div className="flex flex-col gap-5">
      <p>
        We sent a link to <strong className="font-medium break-all">{account.email}</strong>. Open
        it on any device to finish.
      </p>
      <p>Until then your notes stay on this device and don't sync.</p>
      <div className="flex flex-col gap-2">
        {!online && <OfflineNote />}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            disabled={!online || resend.isPending || wait > 0}
            onClick={() => resend.mutate()}
          >
            Send it again
          </Button>
          {wait > 0 && <span className="text-sm text-muted-foreground">available in {wait} s</span>}
        </div>
        {resend.isSuccess && <output className="text-sm">Sent. Check your inbox.</output>}
        {!tooSoon && <FormError>{resend.error && authErrorMessage(resend.error)}</FormError>}
      </div>
      <p className="text-sm">
        Wrong address?{' '}
        <button
          type="button"
          className={linkClass}
          disabled={!online || startAgain.isPending}
          onClick={() => startAgain.mutate()}
        >
          Sign out and start again ›
        </button>
      </p>
      <FormError>{startAgain.error && authErrorMessage(startAgain.error)}</FormError>
    </div>
  );
}
