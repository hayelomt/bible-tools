import type { InboxItem } from '@lamp/domain';
import { today } from '@/lib/dates.ts';

/** A day `n` days after `day` ("2026-10-18"). */
export function addDays(day: string, n: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + n);
  return at.toISOString().slice(0, 10);
}

/** Snooze's quick choices (wireframes/sermon.md "Inbox triage"): Tomorrow, Sunday, In a week. */
export function snoozeChoices(day: string): { label: string; until: string }[] {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  // The next Sunday, a week on when it's Sunday today.
  const sunday = addDays(day, 7 - weekday);
  return [
    { label: 'Tomorrow', until: addDays(day, 1) },
    { label: 'Sunday', until: sunday },
    { label: 'In a week', until: addDays(day, 7) },
  ];
}

/** Items waiting longer than this are flagged (F27). */
export const OLD_AFTER_DAYS = 30;

/**
 * How many days an item has waited in the inbox on `day`: since it arrived in Lamp, so an import's
 * items count from the import, not from the dates in the export.
 */
export function daysWaiting(item: Pick<InboxItem, 'createdAt'>, day: string): number {
  const arrived = today(new Date(item.createdAt));
  return Math.round(
    (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${arrived}T00:00:00Z`)) / 86_400_000,
  );
}

/** "39 days old" for an item waiting more than 30 days; null for any other. */
export function oldLabel(item: Pick<InboxItem, 'createdAt'>, day: string): string | null {
  const days = daysWaiting(item, day);
  return days > OLD_AFTER_DAYS ? `${days} days old` : null;
}
