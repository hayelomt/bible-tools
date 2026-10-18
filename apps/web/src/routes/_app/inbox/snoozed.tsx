import { Button } from '@lamp/ui/components/button';
import { createFileRoute } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChipLine } from '@/components/inbox/inbox-list.tsx';
import { snoozeItems } from '@/components/inbox/triage-actions.ts';
import { ScreenSkeleton } from '@/components/screen-skeleton.tsx';
import { inboxItemTitle, snoozedItems } from '@/data/actions/inbox.ts';
import { shortDate } from '@/lib/dates.ts';
import { useScreenReady } from '@/lib/screen-ready.ts';
import { useToday } from '@/lib/use-today.ts';

export const Route = createFileRoute('/_app/inbox/snoozed')({
  staticData: { title: 'Snoozed', back: '/inbox' },
  component: Snoozed,
});

/**
 * The snoozed items (F27, M11-04): out of the inbox until their day, on every device. Each says
 * when it comes back, with Wake now.
 */
function Snoozed() {
  const day = useToday();
  const items = useLiveQuery(() => snoozedItems(day), [day]);
  useScreenReady('inbox-snoozed', items !== undefined);
  if (items === undefined) return <ScreenSkeleton />;
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center">
        <p className="text-lg font-medium">Nothing snoozed.</p>
        <p className="max-w-xs text-muted-foreground">
          Snooze an inbox item to deal with it later; it comes back on the day you pick.
        </p>
      </div>
    );
  }
  return (
    <ul className="flex flex-col divide-y" aria-label="Snoozed">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0">
          <article aria-label={inboxItemTitle(item)} className="flex flex-col gap-1.5">
            {item.ref && <ChipLine verse={item.ref} />}
            {item.text && (
              <p className="line-clamp-4 break-words whitespace-pre-line">{item.text}</p>
            )}
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">Until {shortDate(item.snoozedUntil!)}</p>
              <Button variant="outline" size="sm" onClick={() => snoozeItems([item.id], null)}>
                Wake now
              </Button>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
