import { MIN_PASSWORD_LENGTH, signupRequestSchema } from '@lamp/domain';
import { Button } from '@lamp/ui/components/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import {
  Field,
  FormError,
  linkClass,
  OfflineNote,
  PasswordField,
} from '@/components/account/fields.tsx';
import { SignedInNote } from '@/components/account/signed-in-note.tsx';
import { lessonCount } from '@/data/queries.ts';
import { noteVerificationSent, setAccount, useAccount } from '@/lib/account.ts';
import { ApiRequestError, signup } from '@/lib/api.ts';
import { authErrorMessage, fieldErrors } from '@/lib/auth-messages.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/signup')({
  staticData: { title: 'Create an account', back: '/settings' },
  component: SignUp,
});

const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters.`;

/** wireframes/account.md "Sign up". */
function SignUp() {
  const account = useAccount().data;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const online = useOnline();
  const lessons = useLiveQuery(() => lessonCount(), []);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const create = useMutation({
    mutationFn: signup,
    onSuccess: (me) => {
      setAccount(queryClient, me);
      noteVerificationSent();
      void navigate({ to: '/check-email' });
    },
  });

  if (account && !create.isSuccess) return <SignedInNote email={account.email} />;

  const code = create.error instanceof ApiRequestError ? create.error.errorCode : undefined;
  if (code === 'SIGNUP_DISABLED') {
    return (
      <div className="flex flex-col gap-4">
        <p>This Lamp server doesn't take new accounts.</p>
        <p>
          Already have an account?{' '}
          <Link to="/signin" className={linkClass}>
            Sign in ›
          </Link>
        </p>
      </div>
    );
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = fieldErrors(
      signupRequestSchema,
      { email, password },
      { email: 'Enter an email address, like you@example.com.', password: PASSWORD_HINT },
    );
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate({ email: email.trim(), password });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <p>
        Back up your notes and sync them between your devices.
        {!!lessons &&
          (lessons === 1
            ? ' The lesson on this device joins the account.'
            : ` The ${lessons} lessons on this device join the account.`)}
      </p>
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
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        value={password}
        error={
          errors.password ??
          (code === 'PASSWORD_TOO_COMMON' ? authErrorMessage(create.error) : undefined)
        }
        onChange={(event) => {
          setPassword(event.target.value);
          setErrors((e) => ({ ...e, password: undefined }));
        }}
      />
      {code !== 'PASSWORD_TOO_COMMON' && create.error && (
        <FormError>
          {authErrorMessage(create.error)}
          {code === 'EMAIL_TAKEN' && (
            <>
              {' '}
              <Link to="/signin" className={linkClass}>
                Sign in ›
              </Link>
            </>
          )}
        </FormError>
      )}
      {!online && <OfflineNote />}
      <Button type="submit" size="lg" disabled={!online || create.isPending}>
        {create.isPending ? 'Creating account…' : 'Create account'}
      </Button>
      <p className="text-sm">
        Already have an account?{' '}
        <Link to="/signin" className={linkClass}>
          Sign in ›
        </Link>
      </p>
    </form>
  );
}
