import { daysBetween, dueDate, type MemoryItem, memoryStage } from '@lamp/domain';
import { shortDate, today as deviceToday } from '@/lib/dates.ts';
import { count } from '@/lib/labels.ts';

/** How far off a review is: "today", "tomorrow", "2 days", "3 months", "2 years". */
export function inDays(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 60) return `${days} days`;
  if (days < 730) return `${Math.round(days / 30.44)} months`;
  return `${Math.round(days / 365.25)} years`;
}

/** "due today" (or overdue), "due tomorrow", "due in 3 days". */
export function dueLabel(item: Pick<MemoryItem, 'nextReviewAt'>, today = deviceToday()): string {
  const days = daysBetween(today, dueDate(item));
  return days <= 1 ? `due ${inDays(days)}` : `due in ${inDays(days)}`;
}

/** The verse index row's progress: "new", "learning · 4 reviews", "known · 12 reviews". */
export function stageLabel(item: MemoryItem): string {
  const stage = memoryStage(item);
  return stage === 'new' ? stage : `${stage} · ${count(item.reviewCount, 'review')}`;
}

/**
 * The card's progress (wireframes/review.md "Memory card"): "New · added 3 Sep", "4 reviews ·
 * learning since 3 Sep", "12 reviews · known · added 3 Sep".
 */
export function progressLabel(item: MemoryItem, now = new Date()): string {
  const added = shortDate(deviceToday(new Date(item.createdAt)), now);
  const stage = memoryStage(item);
  if (stage === 'new') return `New · added ${added}`;
  const reviews = count(item.reviewCount, 'review');
  return stage === 'learning'
    ? `${reviews} · learning since ${added}`
    : `${reviews} · known · added ${added}`;
}

/** "Next verse due tomorrow.", or nothing when there are no memory verses left. */
export function nextDueLine(items: MemoryItem[], today = deviceToday()): string | null {
  const next = items[0];
  if (!next) return null;
  const days = daysBetween(today, dueDate(next));
  if (days <= 0) return 'More verses are due today.';
  return `Next verse due ${days === 1 ? 'tomorrow' : `in ${inDays(days)}`}.`;
}
