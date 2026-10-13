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
