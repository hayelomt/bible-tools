import { loginRequestSchema } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import {
  Field,
  FormError,
  linkClass,
  OfflineNote,
  PasswordField,
} from '@/components/account/fields.tsx';
import { SignedInNote } from '@/components/account/signed-in-note.tsx';
import { setAccount, useAccount } from '@/lib/account.ts';
import { login } from '@/lib/api.ts';
import { authErrorMessage, fieldErrors } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/signin')({
  staticData: { title: 'Sign in', back: '/settings' },
  // Where to go after signing in: a group's invite (M13-07), or Settings.
  validateSearch: (search: Record<string, unknown>): { next?: string } => ({
    next:
      typeof search.next === 'string' && search.next.startsWith('/join?') ? search.next : undefined,
  }),
  component: SignIn,
});

/** wireframes/account.md "Sign in". */
function SignIn() {
  const account = useAccount().data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const online = useOnline();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const signIn = useMutation({
    mutationFn: login,
    onSuccess: (me) => {
      setAccount(queryClient, me);
      void (next ? navigate({ href: next }) : navigate({ to: '/settings' }));
    },
  });

  if (account && !signIn.isSuccess) return <SignedInNote email={account.email} />;

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = fieldErrors(
      loginRequestSchema,
      { email, password },
      { email: 'Enter an email address, like you@example.com.', password: 'Enter your password.' },
    );
    setErrors(found);
    if (Object.keys(found).length === 0) signIn.mutate({ email: email.trim(), password });
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
        error={errors.email}
        onChange={(event) => {
          setEmail(event.target.value);
          setErrors((e) => ({ ...e, email: undefined }));
        }}
      />
      <PasswordField
        label="Password"
        autoComplete="current-password"
        value={password}
        error={errors.password}
        onChange={(event) => {
          setPassword(event.target.value);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
      />
      <FormError>{signIn.error && authErrorMessage(signIn.error)}</FormError>
      {!online && <OfflineNote />}
      <Button type="submit" size="lg" disabled={!online || signIn.isPending}>
        {signIn.isPending ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex flex-col gap-2 text-sm">
        <Link to="/forgot-password" className={linkClass}>
          Forgot your password? ›
        </Link>
        <p>
          No account?{' '}
          <Link to="/signup" className={linkClass}>
            Create one ›
          </Link>
        </p>
      </div>
    </form>
  );
}
