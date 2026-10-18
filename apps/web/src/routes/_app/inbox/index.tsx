import type { InboxItem } from '@lamp/domain';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { AddBox } from '@/components/inbox/add-box.tsx';
import { ClipboardButton } from '@/components/inbox/clipboard-button.tsx';
import { InboxList } from '@/components/inbox/inbox-list.tsx';
import { InboxMenu } from '@/components/inbox/inbox-menu.tsx';
import { InboxSelectionBar, useInboxSelection } from '@/components/inbox/selection-bar.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { inboxEntries, snoozedCount } from '@/data/actions/inbox.ts';
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
  const snoozed = useLiveQuery(() => snoozedCount(day), [day]) ?? 0;
  const items = useMemo(
    () => entries?.flatMap((entry) => (entry.kind === 'item' ? [entry.item] : [])) ?? NO_ITEMS,
    [entries],
  );
  const select = useInboxSelection(items);
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
    <div className={select.selection ? 'flex flex-col gap-6 pb-16' : 'flex flex-col gap-6'}>
      <InboxMenu
        onSelect={items.length > 0 && !select.selection ? () => select.start() : undefined}
      />
      <div className="flex flex-col items-start gap-2">
        <AddBox onAdded={setFresh} />
        <ClipboardButton />
      </div>
      {entries === undefined ? (
        <ScreenSkeleton />
      ) : entries.length === 0 ? (
        <Empty />
      ) : (
        <InboxList
          entries={entries}
          fresh={fresh}
          selection={select.selection}
          onSelect={select.start}
        />
      )}
      {snoozed > 0 && <SnoozedRow count={snoozed} />}
      {select.selection && (
        <InboxSelectionBar
          selected={select.selected}
          total={items.length}
          onSelectAll={select.selectAll}
          onClear={select.clear}
          onClose={select.stop}
        />
      )}
    </div>
  );
}

const NO_ITEMS: InboxItem[] = [];

/** `Snoozed · 4 ›` at the end of the list (M11-04), opening the snoozed items. */
function SnoozedRow({ count }: { count: number }) {
  return (
    <Link
      to="/inbox/snoozed"
      className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex-1">Snoozed · {count}</span>
      <ChevronRight aria-hidden className="size-4" />
    </Link>
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
