import { forgotPasswordRequestSchema } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { Field, FormError, linkClass, OfflineNote } from '@/components/account/fields.tsx';
import { forgotPassword } from '@/lib/api.ts';
import { authErrorMessage, fieldErrors } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/forgot-password')({
  staticData: { title: 'Reset your password', back: '/settings' },
  component: ForgotPassword,
});

/** wireframes/account.md "Forgot and reset password": the same answer whether or not the account exists. */
function ForgotPassword() {
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const send = useMutation({ mutationFn: forgotPassword });

  if (send.isSuccess) {
    return (
      <div className="flex flex-col gap-4">
        <output>
          If there's an account for {send.variables.email}, a link is on its way. It works for one
          hour.
        </output>
        <Link to="/signin" className={linkClass}>
          Back to sign in ›
        </Link>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = fieldErrors(
      forgotPasswordRequestSchema,
      { email },
      { email: 'Enter an email address, like you@example.com.' },
    );
    setError(found.email);
    if (!found.email) send.mutate({ email: email.trim() });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Email"
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder="you@example.com"
        value={email}
        error={error}
        onChange={(event) => {
          setEmail(event.target.value);
          setError(undefined);
        }}
      />
      <FormError>{send.error && authErrorMessage(send.error)}</FormError>
      {!online && <OfflineNote />}
      <Button type="submit" size="lg" disabled={!online || send.isPending}>
        {send.isPending ? 'Sending…' : 'Send a reset link'}
      </Button>
    </form>
  );
}
