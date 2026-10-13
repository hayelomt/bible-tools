import { changePasswordRequestSchema, MIN_PASSWORD_LENGTH } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { FormError, OfflineNote, PasswordField } from '@/components/account/fields.tsx';
import { setAccount, useAccount } from '@/lib/account.ts';
import { ApiRequestError, changePassword } from '@/lib/api.ts';
import { authErrorMessage, fieldErrors } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/settings/password')({
  staticData: { title: 'Change password', back: '/settings' },
  component: ChangePassword,
});

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/** wireframes/account.md "Change password": this device stays signed in, the others don't (§7.2). */
function ChangePassword() {
  const account = useAccount().data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string }>({});
  const change = useMutation({
    mutationFn: changePassword,
    onSuccess: () => {
      toast('Password changed. Your other devices are signed out.');
      void navigate({ to: '/settings' });
    },
    onError: (error) => {
      if (error instanceof ApiRequestError && error.status === 401) setAccount(queryClient, null);
    },
  });

  if (!account) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Sign in to change your password.</p>
        <Link to="/signin" className={buttonVariants({ variant: 'outline' })}>
          Sign in
        </Link>
      </div>
    );
  }

  const code = change.error instanceof ApiRequestError ? change.error.errorCode : undefined;
  const message = change.error ? authErrorMessage(change.error) : undefined;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = fieldErrors(
      changePasswordRequestSchema,
      { currentPassword, newPassword },
      { currentPassword: 'Enter your current password.', newPassword: PASSWORD_HINT },
    );
    setErrors(found);
    if (Object.keys(found).length === 0) change.mutate({ currentPassword, newPassword });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* For password managers, which file the new password under this account. */}
      <input type="email" autoComplete="username" value={account.email} readOnly hidden />
      <PasswordField
        label="Current password"
        autoComplete="current-password"
        value={currentPassword}
        error={errors.currentPassword ?? (code === 'WRONG_PASSWORD' ? message : undefined)}
        onChange={(event) => {
          setCurrent(event.target.value);
          setErrors((e) => ({ ...e, currentPassword: undefined }));
        }}
      />
      <PasswordField
        label="New password"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={newPassword}
        error={errors.newPassword ?? (code === 'PASSWORD_TOO_COMMON' ? message : undefined)}
        onChange={(event) => {
          setNew(event.target.value);
          setErrors((e) => ({ ...e, newPassword: undefined }));
        }}
      />
      <p className="text-sm text-muted-foreground">
        Your other devices will be signed out. Their notes stay on them.
      </p>
      {code !== 'WRONG_PASSWORD' && code !== 'PASSWORD_TOO_COMMON' && (
        <FormError>{message}</FormError>
      )}
      {!online && <OfflineNote />}
      <Button type="submit" size="lg" disabled={!online || change.isPending}>
        {change.isPending ? 'Changing password…' : 'Change password'}
      </Button>
    </form>
  );
}
