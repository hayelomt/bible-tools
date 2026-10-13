import { MIN_PASSWORD_LENGTH, resetPasswordRequestSchema } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { FormError, OfflineNote, PasswordField } from '@/components/account/fields.tsx';
import { setAccount } from '@/lib/account.ts';
import { ApiRequestError, resetPassword } from '@/lib/api.ts';
import { authErrorMessage, fieldErrors } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/reset-password')({
  staticData: { title: 'Choose a new password', back: '/settings' },
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: ResetPassword,
});

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/** The reset link's page (wireframes/account.md "Forgot and reset password"). */
function ResetPassword() {
  const { token = '' } = Route.useSearch();
  const queryClient = useQueryClient();
  const online = useOnline();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const reset = useMutation({
    mutationFn: resetPassword,
    // The server ends every session of the account, this device's too (§7.3).
    onSuccess: () => setAccount(queryClient, null),
  });
  const code = reset.error instanceof ApiRequestError ? reset.error.errorCode : undefined;

  if (reset.isSuccess) {
    return (
      <div className="flex flex-col items-start gap-4">
        <output>
          Password changed. Every device was signed out; sign in with your new password. Your notes
          stay on each device.
        </output>
        <Link to="/signin" className={buttonVariants({ size: 'lg' })}>
          Continue
        </Link>
      </div>
    );
  }

  if (
    code === 'TOKEN_INVALID' ||
    !resetPasswordRequestSchema.shape.token.safeParse(token).success
  ) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>This link has expired or was already used.</p>
        <Link to="/forgot-password" className={buttonVariants({ variant: 'outline' })}>
          Send a new link
        </Link>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = fieldErrors(
      resetPasswordRequestSchema,
      { token, password },
      { password: PASSWORD_HINT },
    );
    setError(found.password);
    if (!found.password) reset.mutate({ token, password });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={password}
        error={
          error ?? (code === 'PASSWORD_TOO_COMMON' ? authErrorMessage(reset.error) : undefined)
        }
        onChange={(event) => {
          setPassword(event.target.value);
          setError(undefined);
        }}
      />
      {code !== 'PASSWORD_TOO_COMMON' && (
        <FormError>{reset.error && authErrorMessage(reset.error)}</FormError>
      )}
      {!online && <OfflineNote />}
      <Button type="submit" size="lg" disabled={!online || reset.isPending}>
        {reset.isPending ? 'Setting password…' : 'Set password'}
      </Button>
    </form>
  );
}
