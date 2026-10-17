import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { AddBox } from '@/components/inbox/add-box.tsx';
import { InboxList } from '@/components/inbox/inbox-list.tsx';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { inboxItems } from '@/data/actions/inbox.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { useToday } from '@/lib/use-today.ts';

export const Route = createFileRoute('/_app/inbox/')({
  staticData: { title: 'Inbox' },
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
  const items = useLiveQuery(() => inboxItems(day), [day]);
  const [fresh, setFresh] = useState<string | null>(null);
  useEffect(() => {
    if (!fresh) return;
    const timer = setTimeout(() => setFresh(null), FRESH_MS);
    return () => clearTimeout(timer);
  }, [fresh]);
  useScreenReady('inbox', items !== undefined);

  return (
    <div className="flex flex-col gap-6">
      <AddBox onAdded={setFresh} />
      {items === undefined ? (
        <ScreenSkeleton />
      ) : items.length === 0 ? (
        <Empty />
      ) : (
        <InboxList items={items} fresh={fresh} />
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
