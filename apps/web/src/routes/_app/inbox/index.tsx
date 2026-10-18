import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AddBox } from '@/components/inbox/add-box.tsx';
import { ClipboardButton } from '@/components/inbox/clipboard-button.tsx';
import { InboxList } from '@/components/inbox/inbox-list.tsx';
import { InboxMenu } from '@/components/inbox/inbox-menu.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { inboxEntries } from '@/data/actions/inbox.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { useToday } from '@/lib/use-today.ts';
import { startVerseMatcher } from '@/verse-match/client.ts';

interface InboxSearch {
  /** An item just added from the share screen, marked briefly at the top. */
  added?: string;
}

export const Route = createFileRoute('/_app/inbox/')({
  staticData: { title: 'Inbox' },
  validateSearch: (search: Record<string, unknown>): InboxSearch => ({
    added: typeof search.added === 'string' ? search.added : undefined,
  }),
  component: Inbox,
});

/** How long a new item stays marked at the top. */
const FRESH_MS = 2000;

/**
 * The inbox (F17, wireframes/interop.md "Inbox"): verses and notes waiting to be put in a lesson,
 * newest first, with the add box always at the top. Read from the device, so there is no loading
 * state beyond the first read.
 */
function Inbox() {
  const day = useToday();
  const entries = useLiveQuery(() => inboxEntries(day), [day]);
  const { added } = Route.useSearch();
  const navigate = Route.useNavigate();
  const [fresh, setFresh] = useState<string | null>(added ?? null);
  // Marked once: reloading or going back shows the inbox as it is.
  useEffect(() => {
    if (added) void navigate({ search: {}, replace: true });
  }, [added, navigate]);
  // Pasting or adding from the clipboard will want the verse matcher (M9-04).
  useEffect(startVerseMatcher, []);
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(null), FRESH_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  useScreenReady('inbox', entries !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <InboxMenu />
      <div className="flex flex-col items-start gap-2">
        <AddBox onAdded={setFresh} />
        <ClipboardButton />
      </div>
      {entries === undefined ? (
        <ScreenSkeleton />
      ) : entries.length === 0 ? (
        <Empty />
      ) : (
        <InboxList entries={entries} fresh={fresh} />
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <p className="text-lg font-medium">Nothing waiting.</p>
      <p className="max-w-xs text-muted-foreground">
        Verses you share to Lamp, paste here or import land here until you put them in a lesson.
      </p>
    </div>
  );
}
