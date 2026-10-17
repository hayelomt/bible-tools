import { useLiveQuery } from 'dexie-react-hooks';
import { inboxCount } from '@/data/actions/inbox.ts';
import { useToday } from '@/lib/use-today.ts';

/** How many items wait in the inbox (the tab's badge); a snooze ends when its day comes. */
export function useInboxCount(): number | undefined {
  const day = useToday();
  return useLiveQuery(() => inboxCount(day), [day]);
}
