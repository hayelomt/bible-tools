import type { CreateShareLinkRequest, ShareLink } from '@lamp/domain';
import { Button, buttonVariants } from '@lamp/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@lamp/ui/components/dialog';
import { Input } from '@lamp/ui/components/input';
import { toast } from '@lamp/ui/components/sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Share2 } from 'lucide-react';
import { useId, useState } from 'react';
import { FormError } from '@/components/account/fields.tsx';
import { ConfirmDialog } from '@/components/confirm-dialog.tsx';
import { Segmented } from '@/components/segmented.tsx';
import { db } from '@/data/db.ts';
import { handoutSnapshot } from '@/export/handout-share.ts';
import { useAccount } from '@/lib/account.ts';
import { ApiRequestError, createShareLink, revokeShareLink } from '@/lib/api.ts';
import { addDays, today } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';
import {
  EXPIRIES,
  type Expiry,
  expiresAt,
  linkFor,
  refreshShareLinks,
  type ShareTarget,
  useShareLinks,
} from '@/lib/share-links.ts';
import { useOnline } from '@/lib/use-online.ts';
import { unsyncedCount } from '@/sync/device-data.ts';
import { LinkDates } from './link-dates.tsx';

/** What the dialog calls the thing shared: "Anyone with the link can read this lesson." */
const NOUNS: Record<ShareTarget['targetType'], string> = {
  lesson: 'lesson',
  series: 'series and its lessons',
  compile: 'commentary',
  handout: 'handout',
};

const EXPIRY_LABELS: Record<Expiry, string> = {
  never: 'Never',
  week: '7 days',
  month: '30 days',
  date: 'Pick a date',
};

const KEEPS = ['frozen', 'live'] as const;
type Keeps = (typeof KEEPS)[number];
const KEEPS_LABELS: Record<Keeps, string> = { frozen: 'As it is now', live: 'Up to date' };

interface ShareLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ShareTarget;
  /** "The Good Shepherd", "Romans 8". */
  title: string;
}

/**
 * Share link (F34, M13-04, wireframes/sharing.md "Share link"): one link per lesson, series,
 * commentary or handout, made and revoked on the server, so it needs an account and a connection.
 */
export function ShareLinkDialog({ open, onOpenChange, target, title }: ShareLinkDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share “{title}”</DialogTitle>
        </DialogHeader>
        {open && <ShareLinkBody target={target} title={title} />}
      </DialogContent>
    </Dialog>
  );
}

function ShareLinkBody({ target, title }: { target: ShareTarget; title: string }) {
  const account = useAccount().data;
  const online = useOnline();
  const links = useShareLinks(account?.id, online);

  if (!account) {
    return (
      <div className="flex flex-col items-start gap-4">
        <DialogDescription>
          Sign in to share a link. Your notes are on this device only, so there’s nothing for a link
          to show.
        </DialogDescription>
        <Link to="/signin" className={buttonVariants()}>
          Sign in
        </Link>
      </div>
    );
  }
  const existing = links.data && linkFor(links.data, target);
  if (existing)
    return <MadeLink link={existing} title={title} userId={account.id} online={online} />;
  if (online && links.isPending) return null;
  return <NewLink target={target} userId={account.id} online={online} listFailed={!!links.error} />;
}

function NewLink({
  target,
  userId,
  online,
  listFailed,
}: {
  target: ShareTarget;
  userId: string;
  online: boolean;
  listFailed: boolean;
}) {
  const queryClient = useQueryClient();
  const [expiry, setExpiry] = useState<Expiry>('never');
  const [day, setDay] = useState(() => addDays(today(), 7));
  const [keeps, setKeeps] = useState<Keeps>('frozen');
  const unsynced = useLiveQuery(() => unsyncedCount(db), []) ?? 0;
  const ids = { day: useId(), error: useId() };
  const until = expiresAt(expiry, day);
  const badDay = expiry === 'date' && until === null;

  const create = useMutation({
    mutationFn: async () => {
      const body = await requestFor(target, until, keeps);
      return createShareLink(body);
    },
    onSuccess: () => refreshShareLinks(queryClient, userId),
    onError: (error) => {
      // Made meanwhile from another device: the list has it now.
      if (error instanceof ApiRequestError && error.errorCode === 'SHARE_LINK_EXISTS') {
        void refreshShareLinks(queryClient, userId);
      }
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!badDay) create.mutate();
      }}
    >
      <DialogDescription>
        Anyone with the link can read this {NOUNS[target.targetType]}. They can’t edit or comment,
        and they don’t need an account. Your other notes stay private.
      </DialogDescription>
      <div className="flex flex-col gap-2">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">Expires</legend>
          <Segmented
            name="share-expiry"
            options={EXPIRIES}
            labels={EXPIRY_LABELS}
            value={expiry}
            onChange={setExpiry}
          />
        </fieldset>
        {expiry === 'date' && (
          <Input
            id={ids.day}
            type="date"
            aria-label="Expires at the end of"
            className="w-fit"
            value={day}
            min={addDays(today(), 1)}
            aria-invalid={badDay || undefined}
            aria-describedby={badDay ? ids.error : undefined}
            onChange={(event) => setDay(event.target.value)}
          />
        )}
        {badDay && (
          <p id={ids.error} className="text-sm text-destructive">
            Pick a day after today.
          </p>
        )}
      </div>
      {target.targetType === 'compile' && (
        <div className="flex flex-col gap-2">
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Keeps</legend>
            <Segmented
              name="share-keeps"
              options={KEEPS}
              labels={KEEPS_LABELS}
              value={keeps}
              onChange={setKeeps}
            />
          </fieldset>
          <p className="text-sm text-muted-foreground">
            {keeps === 'frozen'
              ? 'As it is now: later notes won’t show.'
              : 'Up to date: later notes show as they sync.'}
          </p>
        </div>
      )}
      {target.targetType === 'handout' && (
        <p className="text-sm text-muted-foreground">
          The handout is kept as it is now. Make a new link to share later changes.
        </p>
      )}
      {unsynced > 0 && target.targetType !== 'handout' && (
        <p className="text-sm text-muted-foreground">
          {count(unsynced, 'change')} {unsynced === 1 ? 'hasn’t' : 'haven’t'} synced yet; the link
          shows them once they have.
        </p>
      )}
      {!online && <p className="text-sm text-muted-foreground">Needs a connection</p>}
      <FormError>
        {create.error && !isExists(create.error)
          ? 'Couldn’t make the link. Check the connection and try again. Nothing was shared.'
          : listFailed && online
            ? 'Couldn’t check for a link already made. Check the connection and try again.'
            : null}
      </FormError>
      <Button type="submit" className="self-start" disabled={!online || create.isPending}>
        {create.isPending ? 'Creating link…' : 'Create link'}
      </Button>
    </form>
  );
}

const isExists = (error: unknown) =>
  error instanceof ApiRequestError && error.errorCode === 'SHARE_LINK_EXISTS';

async function requestFor(
  target: ShareTarget,
  until: string | null,
  keeps: Keeps,
): Promise<CreateShareLinkRequest> {
  switch (target.targetType) {
    case 'compile':
      return { ...target, live: keeps === 'live', expiresAt: until };
    case 'handout': {
      const handout = await handoutSnapshot(target.targetId);
      if (!handout) throw new Error('The lesson is gone');
      return { ...target, handout, expiresAt: until };
    }
    default:
      return { targetType: target.targetType, targetId: target.targetId, expiresAt: until };
  }
}

/** A link already made: its address to copy or share, its dates, and Revoke. */
function MadeLink({
  link,
  title,
  userId,
  online,
}: {
  link: ShareLink;
  title: string;
  userId: string;
  online: boolean;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const revoke = useMutation({
    mutationFn: () => revokeShareLink(link.id),
    onSuccess: () => {
      toast('Link revoked.');
      return refreshShareLinks(queryClient, userId);
    },
  });
  const canShare = typeof navigator.share === 'function';

  return (
    <div className="flex flex-col gap-4">
      <DialogDescription className="sr-only">The link to {title}</DialogDescription>
      <div className="flex gap-2">
        <Input readOnly value={link.url} aria-label="Link" onFocus={(e) => e.target.select()} />
        <Button variant="outline" onClick={() => void copyLink(link.url)}>
          <Copy aria-hidden />
          Copy
        </Button>
      </div>
      <LinkDates link={link} />
      <FormError>
        {revoke.error && 'Couldn’t revoke the link. Check the connection and try again.'}
      </FormError>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {canShare ? (
          <Button
            variant="outline"
            onClick={() => void navigator.share({ title, url: link.url }).catch(() => {})}
          >
            <Share2 aria-hidden />
            Share…
          </Button>
        ) : (
          <span />
        )}
        <Button
          variant="ghost"
          className="text-destructive"
          disabled={!online || revoke.isPending}
          onClick={() => setAsking(true)}
        >
          Revoke link…
        </Button>
      </div>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Revoke the link to ${title}?`}
        description="Anyone who has it can’t open it any more."
        confirmLabel="Revoke link"
        onConfirm={() => revoke.mutateAsync().catch(() => {})}
      />
    </div>
  );
}

export async function copyLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast('Link copied.');
  } catch {
    toast('Couldn’t copy the link. Select it and copy it instead.');
  }
}
