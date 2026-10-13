import type { Lesson, Series } from '@lamp/domain';

/** Words for stored values (UX-PATTERNS "Words"). */

export const SOURCE_LABELS: Record<Lesson['source'], string> = {
  sermon: 'Sermon',
  personal: 'Personal',
  group: 'Group',
};

export const SERIES_KIND_LABELS: Record<Series['kind'], string> = {
  sermon_series: 'Sermon series',
  book_study: 'Book study',
  custom: 'Other',
};

/** "1 lesson", "3 lessons". */
export function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** "a•••@example.com": names an account on a shared screen without showing the whole address. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at > 0 ? `${email[0]}•••${email.slice(at)}` : '•••';
}

/** "12 lessons, 3 highlights and 2 memory verses", leaving out what there's none of. */
export function notesSummary(counts: {
  lessons: number;
  highlights: number;
  memoryItems: number;
}): string {
  const parts = [
    counts.lessons && count(counts.lessons, 'lesson'),
    counts.highlights && count(counts.highlights, 'highlight'),
    counts.memoryItems && count(counts.memoryItems, 'memory verse'),
  ].filter((part): part is string => !!part);
  if (parts.length === 0) return 'No notes';
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}
