import { Button, buttonVariants } from '@lamp/ui/components/button';
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@lamp/ui/components/popover';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@lamp/ui/components/sheet';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { cn } from 'cn';
import { useLiveQuery } from 'dexie-react-hooks';
import { CircleAlert, CircleCheck, CircleDashed } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { writesSettled } from '@/data/action.ts';
import { db, SYNC_STATE_KEY } from '@/data/db.ts';
import { noteVerificationSent, refreshAccount, useAccount } from '@/lib/account.ts';
import { ApiRequestError, resendVerification } from '@/lib/api.ts';
import { authErrorMessage } from '@/lib/auth-messages.ts';
import { agoLabel, momentLabel } from '@/lib/dates.ts';
import { useDevices } from '@/lib/devices.ts';
import { count, maskEmail } from '@/lib/labels.ts';
import { useMediaQuery } from '@/lib/use-media-query.ts';
import { useOnline } from '@/lib/use-online.ts';
import { unsyncedCount } from '@/sync/device-data.ts';
import { discardRejected } from '@/sync/outbox.ts';
import { type RejectedChange, rejectedChanges } from '@/sync/rejected.ts';
import {
  clockWarning,
  indicator,
  SYNCING_DELAY_MS,
  type SyncView,
  syncView,
  type Tone,
} from '@/sync/status-view.ts';
import { syncEngine, useSyncStatus } from '@/sync/sync.ts';
import type { SyncStatus as EngineStatus } from '@/sync/engine.ts';

/** The panel is a popover from here, as the sidebar shows (wireframes/shell.md). */
const LAPTOP_QUERY = '(min-width: 1024px)';
/** How often times like "2 min ago" and the 10-minute problem threshold are looked at again. */
const TICK_MS = 30_000;

const TONES: Record<Tone, { icon: typeof CircleCheck; className: string }> = {
  quiet: { icon: CircleDashed, className: 'text-muted-foreground' },
  ok: { icon: CircleCheck, className: 'text-muted-foreground' },
  act: { icon: CircleAlert, className: 'text-destructive' },
};

/**
 * The sync status (wireframes/sync.md, UX-PATTERNS "Offline and sync"): one line in the phone's
 * header and at the foot of the laptop's sidebar. Quiet while all is well; the destructive colour
 * only when the user has to act. On a phone a quiet state is its icon alone, so the screen's
 * title has the room; its words are still read out (decided 2026-10-15). A tap opens the sync
 * panel, a sheet on a phone and a popover on a laptop. Changes are announced politely
 * (`role="status"`).
 */
export function SyncStatus({ className }: { className?: string }) {
  const sync = useSync();
  const laptop = useMediaQuery(LAPTOP_QUERY);
  const [open, setOpen] = useState(false);
  const { text, tone } = indicator(sync.view, sync.waiting);
  const { icon: Icon, className: toneClass } = TONES[tone];
  const trigger = (
    <>
      <Icon aria-hidden className="size-4 shrink-0" />
      <output className={cn('truncate', tone !== 'act' && 'max-sm:sr-only')}>{text}</output>
    </>
  );
  const triggerClass = cn(
    'flex min-w-0 items-center gap-1.5 rounded-lg text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:min-h-11',
    toneClass,
    className,
  );
  const body = <SyncPanel sync={sync} onDone={() => setOpen(false)} />;

  if (laptop) {
    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger className={triggerClass} aria-label={`Sync: ${text}`}>
          {trigger}
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-80 gap-3 p-4">
          <PopoverTitle className="text-base">Sync</PopoverTitle>
          {body}
        </PopoverContent>
      </Popover>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        className={cn(
          triggerClass,
          'px-2',
          tone !== 'act' && 'justify-center max-sm:pointer-coarse:min-w-11',
        )}
        aria-label={`Sync: ${text}`}
      >
        {trigger}
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[85svh] w-full max-w-2xl gap-3 overflow-y-auto rounded-t-2xl border-x p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] motion-reduce:data-ending-style:translate-y-0 motion-reduce:data-starting-style:translate-y-0"
      >
        <SheetTitle className="text-lg">Sync</SheetTitle>
        {body}
      </SheetContent>
    </Sheet>
  );
}

interface Sync {
  view: SyncView;
  status: EngineStatus;
  signedIn: boolean;
  /** The signed-in account's id, for its devices. */
  userId: string | null;
  email: string | null;
  waiting: number;
  rejected: RejectedChange[];
  clockOffsetMs: number;
  /** When a sync last went through: this session's, else the last pull stored on the device. */
  lastSyncAt: string | null;
  now: number;
}

/** Everything the status line and panel show, kept current. */
function useSync(): Sync {
  const status = useSyncStatus();
  const account = useAccount().data ?? null;
  const online = useOnline();
  const now = useNow();
  const details = useLiveQuery(
    async () => ({
      waiting: await unsyncedCount(db),
      rejected: await rejectedChanges(db),
      state: await db.syncState.get(SYNC_STATE_KEY),
    }),
    [],
  );
  const rejected = details?.rejected ?? [];
  const view = useDelayedSyncing(
    syncView({ status, signedIn: !!account, online, rejected: rejected.length, now }),
  );
  return {
    view,
    status,
    signedIn: !!account,
    userId: account?.id ?? null,
    email: account?.email ?? details?.state?.ownerEmail ?? null,
    waiting: details?.waiting ?? 0,
    rejected,
    clockOffsetMs: details?.state?.clockOffsetMs ?? 0,
    lastSyncAt: status.lastSyncAt ?? details?.state?.lastPullAt ?? null,
    now,
  };
}

/** "Syncing…" only once a sync has run for a second; until then the last state stays. */
function useDelayedSyncing(view: SyncView): SyncView {
  const [before, setBefore] = useState(view);
  const [late, setLate] = useState(false);
  if (view !== 'syncing') {
    if (before !== view) setBefore(view);
    if (late) setLate(false);
  }
  useEffect(() => {
    if (view !== 'syncing') return;
    const timer = setTimeout(() => setLate(true), SYNCING_DELAY_MS);
    return () => clearTimeout(timer);
  }, [view]);
  return view === 'syncing' && !late ? before : view;
}

function useNow(): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/** The sync panel's contents (wireframes/sync.md "Sync panel"). */
function SyncPanel({ sync, onDone }: { sync: Sync; onDone: () => void }) {
  const { view, status, waiting, rejected, now } = sync;
  const at = new Date(now);
  const lastSynced = sync.lastSyncAt && `Last synced ${momentLabel(sync.lastSyncAt, at, ' at ')}.`;
  const waitingLine =
    waiting > 0 &&
    `${count(waiting, 'change')} ${waiting === 1 ? 'is' : 'are'} saved on this device`;
  const clock = sync.signedIn ? clockWarning(sync.clockOffsetMs) : null;
  const canSync = sync.signedIn && ['synced', 'syncing', 'offline', 'problem'].includes(view);

  return (
    <div className="flex flex-col gap-3">
      {view === 'guest' && (
        <Headline tone="quiet" title="On this device">
          Your notes are saved in this browser only. An account backs them up and keeps them in step
          on your other devices; you can make one in Settings.
        </Headline>
      )}
      {view === 'synced' && (
        <Headline
          tone="ok"
          title={sync.lastSyncAt ? `Synced ${agoLabel(sync.lastSyncAt, at)}` : 'Synced'}
        />
      )}
      {view === 'syncing' && <Syncing progress={status.progress} />}
      {view === 'offline' && (
        <Headline tone="quiet" title="Offline">
          {waitingLine && `${waitingLine} and will sync when you're online. `}
          {lastSynced}
        </Headline>
      )}
      {view === 'verify' && <VerifyEmail email={sync.email} />}
      {view === 'signed-out' && (
        <Headline
          tone="act"
          title="Sign in to sync"
          action={
            <Link
              to="/signin"
              onClick={onDone}
              className={buttonVariants({ variant: 'outline', className: 'self-start' })}
            >
              Sign in
            </Link>
          }
        >
          Your notes are safe on this device.{' '}
          {waitingLine &&
            `${waitingLine} and will sync when you sign in${sync.email ? ` as ${maskEmail(sync.email)}` : ''}.`}
        </Headline>
      )}
      {view === 'update' && (
        <Headline
          tone="act"
          title="Update Lamp"
          action={
            <Button variant="outline" className="self-start" onClick={() => void reloadToUpdate()}>
              Reload to update
            </Button>
          }
        >
          This version of Lamp can't sync any more. Your notes are safe on this device.
        </Headline>
      )}
      {view === 'problem' && rejected.length === 0 && (
        <Headline tone="act" title="Sync problem">
          The server hasn't accepted a sync
          {status.failingSince ? ` since ${momentLabel(status.failingSince, at)}` : ''}. Lamp keeps
          trying, and your notes are safe on this device. {lastSynced}
        </Headline>
      )}
      {view === 'paused' && (
        <Headline tone="quiet" title="Not synced">
          Choose what happens to the notes from another account first.
        </Headline>
      )}
      {rejected.length > 0 && <Rejected changes={rejected} onOpen={onDone} />}
      {clock && (
        <p role="alert" className="flex gap-2 text-sm text-destructive">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {clock}
        </p>
      )}
      {sync.userId && sync.email && <AccountLine userId={sync.userId} email={sync.email} />}
      {canSync && (
        <Button
          variant="outline"
          className="self-start"
          disabled={status.phase === 'syncing'}
          onClick={() => void syncEngine.syncNow()}
        >
          Sync now
        </Button>
      )}
    </div>
  );
}

/** "a•••@example.com · 2 devices": the count from the devices list, once it's known (§6.6). */
function AccountLine({ userId, email }: { userId: string; email: string }) {
  const devices = useDevices(userId).data;
  return (
    <p className="text-sm break-all text-muted-foreground">
      {maskEmail(email)}
      {devices?.length ? ` · ${count(devices.length, 'device')}` : ''}
    </p>
  );
}

function Headline({
  tone,
  title,
  children,
  action,
}: {
  tone: Tone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { icon: Icon, className } = TONES[tone];
  return (
    <div className="flex flex-col gap-2">
      <p className={cn('flex items-center gap-2 font-medium', tone === 'act' && className)}>
        <Icon aria-hidden className={cn('size-4 shrink-0', className)} />
        {title}
      </p>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
      {action}
    </div>
  );
}

/** A sync running; on a new device, how much of the account has come ("1,240 of 3,000"). */
function Syncing({ progress }: { progress: EngineStatus['progress'] }) {
  if (!progress?.firstSync) return <Headline tone="quiet" title="Syncing…" />;
  return (
    <div className="flex flex-col gap-2">
      <Headline tone="quiet" title="Getting your notes…" />
      <div className="flex items-center gap-3">
        <progress
          value={progress.done}
          max={progress.total}
          aria-label="Notes received"
          className="h-2 flex-1 overflow-hidden rounded-full bg-muted [&::-moz-progress-bar]:bg-primary [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-primary"
        />
        <span className="text-sm text-muted-foreground tabular-nums">
          {format(progress.done)} of {format(progress.total)}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">You can keep working meanwhile.</p>
    </div>
  );
}

const format = (n: number) => n.toLocaleString('en-GB');

/** "Verify your email", with its one action: send the link again. */
function VerifyEmail({ email }: { email: string | null }) {
  const queryClient = useQueryClient();
  const online = useOnline();
  const resend = useMutation({
    mutationFn: resendVerification,
    onSuccess: () => noteVerificationSent(),
    onError: (error) => {
      if (!(error instanceof ApiRequestError)) return;
      if (error.errorCode === 'RESEND_TOO_SOON') noteVerificationSent(error.retryAfterSeconds);
      if (error.errorCode === 'ALREADY_VERIFIED') void refreshAccount(queryClient);
    },
  });
  return (
    <Headline
      tone="act"
      title="Verify your email"
      action={
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="self-start"
            disabled={!online || resend.isPending}
            onClick={() => resend.mutate()}
          >
            Resend email
          </Button>
          {resend.isSuccess && <output className="text-sm">Sent. Check your inbox.</output>}
          {resend.error && (
            <p role="alert" className="text-sm text-destructive">
              {authErrorMessage(resend.error)}
            </p>
          )}
        </div>
      }
    >
      Open the link we sent{email ? ` to ${maskEmail(email)}` : ''}. Nothing syncs until then, and
      your notes are safe on this device.
    </Headline>
  );
}

/** Changes the server refused (§6.2): what each was, why, and Open or Discard. */
function Rejected({ changes, onOpen }: { changes: RejectedChange[]; onOpen: () => void }) {
  const discard = useMutation({
    mutationFn: async (seq: number) => {
      await discardRejected(db, seq);
      // The server's copy comes back, and anything held behind it goes.
      void syncEngine.syncNow();
    },
  });
  return (
    <div className="flex flex-col gap-2">
      <Headline tone="act" title={`${count(changes.length, 'change')} couldn't sync`} />
      <ul className="flex flex-col gap-2">
        {changes.map((change) => (
          <li key={change.seq} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
            <span className="font-medium break-words">{change.what}</span>
            <span>{change.reason}</span>
            <span className="font-mono text-xs break-words text-muted-foreground">
              {change.details}
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              <OpenLink change={change} onOpen={onOpen} />
              <Button
                variant="outline"
                size="sm"
                disabled={discard.isPending}
                onClick={() => discard.mutate(change.seq)}
              >
                Discard
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        Discard puts back the server's copy. Later changes to the same item wait until then.
      </p>
    </div>
  );
}

function OpenLink({ change, onOpen }: { change: RejectedChange; onOpen: () => void }) {
  const className = buttonVariants({ variant: 'outline', size: 'sm' });
  const { target } = change;
  switch (target?.kind) {
    case 'lesson':
      return (
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId: target.lessonId }}
          search={target.search}
          onClick={onOpen}
          className={className}
        >
          Open
        </Link>
      );
    case 'series':
      return (
        <Link
          to="/series/$seriesId"
          params={{ seriesId: target.seriesId }}
          onClick={onOpen}
          className={className}
        >
          Open
        </Link>
      );
    case 'tag':
      return (
        <Link
          to="/tags/$tagId"
          params={{ tagId: target.tagId }}
          onClick={onOpen}
          className={className}
        >
          Open
        </Link>
      );
    case 'settings':
      return (
        <Link to="/settings" onClick={onOpen} className={className}>
          Open
        </Link>
      );
    default:
      return null;
  }
}

/**
 * "Reload to update": the server needs a newer Lamp (`426`). Waits for writes in flight, then
 * takes a newer service worker if one is found, and reloads.
 */
async function reloadToUpdate() {
  await writesSettled();
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await registration?.update().catch(() => undefined);
  const waiting = registration?.waiting;
  if (waiting) {
    navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
      once: true,
    });
    // A service worker's postMessage has no target origin.
    // oxlint-disable-next-line unicorn/require-post-message-target-origin
    waiting.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  window.location.reload();
}
