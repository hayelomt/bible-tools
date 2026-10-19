import { Button } from '@lamp/ui/components/button';
import { useMutation } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { FormError, OfflineNote } from '@/components/account/fields.tsx';
import { ApiRequestError, unsubscribe } from '@/lib/api.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/unsubscribe')({
  staticData: { title: 'Weekly email', back: '/' },
  // The token is in the query, which logs and error reports leave out (§17.12).
  validateSearch: (search: Record<string, unknown>): { token?: string } => ({
    token: typeof search.token === 'string' ? search.token : undefined,
  }),
  component: Unsubscribe,
});

/**
 * The weekly email's "Stop these emails" (M13-12), signed in or not. A button, not a visit, turns
 * it off: mail scanners open links on their own.
 */
function Unsubscribe() {
  const { token = '' } = Route.useSearch();
  const online = useOnline();
  const stop = useMutation({ mutationFn: () => unsubscribe(token) });

  if (stop.isSuccess) {
    return (
      <div className="flex flex-col gap-2">
        <p>You won’t get the weekly email of group activity any more.</p>
        <p className="text-sm text-muted-foreground">
          To get it again, turn it on in Settings → Groups.
        </p>
      </div>
    );
  }
  // A link cut short or changed is refused as it is (400), one not made here not found (404).
  const broken =
    !token ||
    (stop.error instanceof ApiRequestError &&
      (stop.error.status === 400 || stop.error.status === 404));
  if (broken) return <p>This link doesn’t work. Turn the email off in Settings → Groups.</p>;
  return (
    <div className="flex flex-col gap-4">
      <p>Stop the weekly email of group activity?</p>
      {!online && <OfflineNote />}
      <FormError>{stop.error ? 'Something went wrong. Try again.' : undefined}</FormError>
      <Button
        className="self-start"
        disabled={!online || stop.isPending}
        onClick={() => stop.mutate()}
      >
        Stop the emails
      </Button>
    </div>
  );
}
