import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { reviewCount } from '@/data/review.ts';
import { today } from '@/lib/dates.ts';
import { setAppBadge } from '@/lib/reminder.ts';

/**
 * How many things wait in the review queue: open questions plus verses due today (wireframes/
 * review.md). Read again when the app comes back into view, so a new day's verses count.
 */
export function useReviewCount(): number | undefined {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setDay(today());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  const count = useLiveQuery(() => reviewCount(day), [day]);
  return count && count.questions + count.verses;
}

/** Keeps the installed app's icon badge at the Review tab's count. Once, in the shell. */
export function useAppBadge(): void {
  const count = useReviewCount();
  useEffect(() => {
    if (count !== undefined) setAppBadge(count);
  }, [count]);
}
