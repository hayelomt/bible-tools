import type { ReviewCount } from './review-count.ts';

/**
 * The weekly reminder (F9, TECH-DESIGN §8.8). The service worker's periodic sync counts the queue
 * on the device (`countWaiting`) and says what waits; with nothing waiting it says nothing.
 */

/** The periodic sync's tag, registered by Settings and handled by the service worker. */
export const REMINDER_TAG = 'weekly-review';

/** At most once a week; the browser picks the moment (and may wait longer). */
export const REMINDER_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** "3 open questions and 2 verses due.", or null when nothing waits. */
export function reminderBody({ questions, verses }: ReviewCount): string | null {
  const parts = [
    questions > 0 && `${questions} open question${questions === 1 ? '' : 's'}`,
    verses > 0 && `${verses} verse${verses === 1 ? '' : 's'} due`,
  ].filter(Boolean);
  return parts.length > 0 ? `${parts.join(' and ')}.` : null;
}

export interface Reminder {
  title: string;
  body: string;
  /** For the app icon's badge, as on the Review tab. */
  count: number;
}

/** What the reminder says, or null with nothing to review. */
export function weeklyReminder(count: ReviewCount): Reminder | null {
  const body = reminderBody(count);
  if (!body) return null;
  return { title: 'Time to review', body, count: count.questions + count.verses };
}
