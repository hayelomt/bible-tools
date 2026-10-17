import { useLiveQuery } from 'dexie-react-hooks';
import { type ReactNode, createContext, use, useEffect } from 'react';
import { reviewCount } from '@/data/review.ts';
import { setAppBadge } from '@/lib/reminder.ts';
import { useToday } from '@/lib/use-today.ts';

const ReviewCount = createContext<number | undefined>(undefined);

/**
 * Reads the review queue's count once for the whole shell: the Review tab and the installed
 * app's icon badge share it, so the queue is read once and not per reader.
 */
export function ReviewCountProvider({ children }: { children: ReactNode }) {
  const count = useLiveReviewCount();
  useEffect(() => {
    if (count !== undefined) setAppBadge(count);
  }, [count]);
  return <ReviewCount value={count}>{children}</ReviewCount>;
}

/** How many things wait in the review queue, from `ReviewCountProvider`. */
export function useReviewCount(): number | undefined {
  return use(ReviewCount);
}

/**
 * Open questions plus verses due today (wireframes/review.md). Read again when the app comes back
 * into view, so a new day's verses count.
 */
function useLiveReviewCount(): number | undefined {
  const day = useToday();
  const count = useLiveQuery(() => reviewCount(day), [day]);
  return count && count.questions + count.verses;
}
