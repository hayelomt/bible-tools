import { Button, buttonVariants } from '@lamp/ui/components/button';
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Field, FormError, linkClass, OfflineNote } from '@/components/account/fields.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { useAccount } from '@/lib/account.ts';
import { ApiRequestError, joinGroup, previewInvite } from '@/lib/api.ts';
import { afterGroupChange, groupErrorMessage } from '@/lib/groups.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/join')({
  staticData: { title: 'Join a group', back: '/' },
  // The token is in the query, which logs and error reports leave out (§17.12).
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: Join,
});

/**
 * An invite's page (wireframes/sharing.md "Join"): the group, who invited and to what, then the
 * user's name in it. Signed out, it asks to sign in and comes back here.
 */
function Join() {
  const { token = '' } = Route.useSearch();
  const account = useAccount().data;
  const online = useOnline();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState('');
  const [missing, setMissing] = useState(false);
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => previewInvite(token),
    enabled: online && token.length > 0,
    retry: false,
  });
  const join = useMutation({
    mutationFn: () => joinGroup(token, displayName.trim()),
    onSuccess: async (groupId) => {
      await afterGroupChange();
      void navigate({ to: '/groups/$groupId', params: { groupId }, replace: true });
    },
    onError: (error) => {
      // Already in it: open it.
      if (
        error instanceof ApiRequestError &&
        error.errorCode === 'ALREADY_MEMBER' &&
        preview.data
      ) {
        void navigate({ to: '/groups/$groupId', params: { groupId: preview.data.groupId } });
      }
    },
  });

  if (!online) return <OfflineNote />;
  if (!token || preview.error) {
    return <p>This invite doesn’t work any more. Ask for a new link.</p>;
  }
  if (!preview.data) return <ScreenSkeleton rows={2} />;
  const { name, ownerName, series, members } = preview.data;
  const studying = series.length > 0 ? series.join(', ') : 'together';

  return (
    <form
      className="flex flex-col gap-5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (!displayName.trim()) return setMissing(true);
        join.mutate();
      }}
    >
      <h2 className="text-xl font-semibold">Join {name}?</h2>
      <p>
        {ownerName} invited you to study {studying} with{' '}
        {members === 1 ? 'them' : `${members} people`}. Members see what you add to the group
        thread, and your comments. Your own notes stay yours.
      </p>
      {account ? (
        <>
          <Field
            label="Your name in this group"
            value={displayName}
            maxLength={40}
            autoComplete="nickname"
            hint="What members see. They never see your email."
            error={missing ? 'Members need a name to know you by.' : undefined}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setMissing(false);
            }}
          />
          <FormError>{join.error && groupErrorMessage(join.error)}</FormError>
          <Button type="submit" size="lg" disabled={join.isPending}>
            {join.isPending ? 'Joining…' : 'Join group'}
          </Button>
        </>
      ) : (
        <div className="flex flex-col items-start gap-3">
          <Link
            to="/signin"
            search={{ next: `/join?token=${token}` }}
            className={buttonVariants({ size: 'lg' })}
          >
            Sign in to join
          </Link>
          <Link to="/signup" className={linkClass}>
            New to Lamp? Sign up
          </Link>
        </div>
      )}
    </form>
  );
}
