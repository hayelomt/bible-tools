import type { Lesson, Series } from '@lamp/domain';

/** Words for stored values (UX-PATTERNS "Words"). */

export const KIND_LABELS: Record<Lesson['kind'], string> = {
  sermon: 'Sermon',
  personal: 'Personal',
  group: 'Group',
};

export const SERIES_KIND_LABELS: Record<Series['kind'], string> = {
  sermon_series: 'Sermon series',
  book_study: 'Book study',
  custom: 'Other',
};

/** "1 lesson", "3 lessons"; `plural` for a noun that doesn't just add an s. */
export function count(n: number, noun: string, plural = `${noun}s`): string {
  return `${n} ${n === 1 ? noun : plural}`;
}

/** "a•••@example.com": names an account on a shared screen without showing the whole address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : '•••';
}

/** The notes on a device, as the removal dialogs count them (`noteCounts`). */
export interface NoteCounts {
  lessons: number;
  highlights: number;
  memoryItems: number;
  inboxItems: number;
}

export const notesTotal = (counts: NoteCounts): number =>
  counts.lessons + counts.highlights + counts.memoryItems + counts.inboxItems;

/** "12 lessons, 3 highlights and 2 memory verses", leaving out what there's none of. */
export function notesSummary(counts: NoteCounts): string {
  const parts = [
    counts.lessons && count(counts.lessons, 'lesson'),
    counts.highlights && count(counts.highlights, 'highlight'),
    counts.memoryItems && count(counts.memoryItems, 'memory verse'),
    counts.inboxItems && count(counts.inboxItems, 'inbox item'),
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return 'No notes';
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
