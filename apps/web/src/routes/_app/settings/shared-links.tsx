import type { ShareLink } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useState } from 'react';
import { FormError } from '@/components/account/fields.tsx';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { LinkDates } from '@/components/share-links/link-dates.tsx';
import { copyLink } from '@/components/share-links/share-link-dialog.tsx';
import { useAccount } from '@/lib/account.ts';
import { NetworkError, revokeShareLink } from '@/lib/api.ts';
import { dayAndMonth } from '@/lib/dates.ts';
import { useAfter } from '@/lib/use-after.ts';
import {
  isExpired,
  localDay,
  refreshShareLinks,
  TARGET_LABELS,
  useShareLinks,
} from '@/lib/share-links.ts';
import { useOnline } from '@/lib/use-online.ts';

export const Route = createFileRoute('/_app/settings/shared-links')({
  staticData: { title: 'Shared links', back: '/settings' },
  component: SharedLinks,
});

/**
 * wireframes/sharing.md "Shared links in Settings": every share link, newest first, with its
 * dates, Copy and Revoke. An expired one stays, muted, until removed; a revoked one leaves.
 */
function SharedLinks() {
  const account = useAccount().data;
  const online = useOnline();
  const links = useShareLinks(account?.id, online);
  const slow = useAfter(300);

  if (!account) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Sign in to see the links you’ve shared.</p>
        <Link to="/signin" className={buttonVariants({ variant: 'outline' })}>
          Sign in
        </Link>
      </div>
    );
  }
  if (!online || links.error instanceof NetworkError) {
    return <p className="text-muted-foreground">The list needs a connection.</p>;
  }
  if (links.error) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p>Your shared links couldn’t be loaded.</p>
        <Button variant="outline" onClick={() => void links.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!links.data) {
    return slow ? (
      <div aria-busy="true">
        <ScreenSkeleton rows={3} />
      </div>
    ) : null;
  }
  if (links.data.length === 0) {
    return (
      <p className="text-muted-foreground">
        No shared links. Make one from a lesson’s, a series’ or a commentary’s ⋯.
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y">
      {links.data.map((link) => (
        <LinkRow key={link.id} link={link} userId={account.id} />
      ))}
    </ul>
  );
}

/** "LESSON · The Good Shepherd"; a frozen commentary adds its day: "· as of 17 Oct". */
function heading(link: ShareLink): string {
  const keeps =
    link.targetType !== 'compile'
      ? ''
      : link.live
        ? ' · up to date'
        : ` · as of ${dayMonth(localDay(link.createdAt))}`;
  const gone = link.gone ? ' (deleted)' : '';
  return `${TARGET_LABELS[link.targetType].toUpperCase()} · ${link.title}${gone}${keeps}`;
}

/** "17 Oct". */
const dayMonth = (day: string) => dayAndMonth(day).split(' ').slice(1).join(' ');

function LinkRow({ link, userId }: { link: ShareLink; userId: string }) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const expired = isExpired(link);
  const revoke = useMutation({
    mutationFn: () => revokeShareLink(link.id),
    onSuccess: () => {
      if (!expired) toast('Link revoked.');
      return refreshShareLinks(queryClient, userId);
    },
  });
  return (
    <li className={cn('flex flex-col gap-1 py-3', expired && 'text-muted-foreground')}>
      <p className="text-sm font-medium tracking-wide break-words">{heading(link)}</p>
      <LinkDates link={link} />
      <FormError>
        {revoke.error && 'Couldn’t do that. Check the connection and try again.'}
      </FormError>
      <div className="flex items-center justify-between gap-2">
        {expired ? (
          <span />
        ) : (
          <Button variant="outline" size="sm" onClick={() => void copyLink(link.url)}>
            Copy
          </Button>
        )}
        {expired ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={revoke.isPending}
            onClick={() => revoke.mutate()}
          >
            Remove
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={revoke.isPending}
            onClick={() => setAsking(true)}
          >
            Revoke…
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Revoke the link to ${link.title}?`}
        description="Anyone who has it can’t open it any more."
        confirmLabel="Revoke link"
        onConfirm={() => revoke.mutateAsync().catch(() => {})}
      />
    </li>
  );
}
