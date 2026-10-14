import type { Lesson, MemoryItem, Question } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import { reminderBody, weeklyReminder } from './reminder.ts';
import { countWaiting } from './review-count.ts';

describe('reminderBody', () => {
  it('says what waits, in words, or nothing', () => {
    expect(reminderBody({ questions: 3, verses: 2 })).toBe('3 open questions and 2 verses due.');
    expect(reminderBody({ questions: 1, verses: 0 })).toBe('1 open question.');
    expect(reminderBody({ questions: 0, verses: 1 })).toBe('1 verse due.');
    expect(reminderBody({ questions: 0, verses: 0 })).toBeNull();
  });
});

describe('weeklyReminder', () => {
  it('has a title, the body and the count for the badge; nothing waiting means none', () => {
    expect(weeklyReminder({ questions: 1, verses: 2 })).toEqual({
      title: 'Time to review',
      body: '1 open question and 2 verses due.',
      count: 3,
    });
    expect(weeklyReminder({ questions: 0, verses: 0 })).toBeNull();
  });
});

// Only the fields counted; the rows come straight from IndexedDB in the service worker.
const lesson = (id: string, deletedAt: string | null = null) => ({ id, deletedAt }) as Lesson;
const question = (lessonId: string, status: Question['status'], deletedAt: string | null = null) =>
  ({ lessonId, status, deletedAt }) as Question;
const item = (nextReviewAt: string, deletedAt: string | null = null) =>
  ({ nextReviewAt, deletedAt }) as MemoryItem;

describe('countWaiting', () => {
  it('counts open questions of live lessons and the verses due today', () => {
    const rows = {
      lessons: [lesson('a'), lesson('gone', '2026-10-13T00:00:00.000Z')],
      questions: [
        question('a', 'open'),
        question('a', 'open'),
        question('a', 'parked'),
        question('a', 'answered'),
        question('a', 'open', '2026-10-13T00:00:00.000Z'),
        question('gone', 'open'),
      ],
      items: [
        item('2026-10-14T00:00:00.000Z'),
        item('2026-10-01T00:00:00.000Z'),
        item('2026-10-15T00:00:00.000Z'),
        item('2026-10-01T00:00:00.000Z', '2026-10-13T00:00:00.000Z'),
      ],
    };
    expect(countWaiting(rows, '2026-10-14')).toEqual({ questions: 2, verses: 2 });
    expect(countWaiting(rows, '2026-10-15')).toEqual({ questions: 2, verses: 3 });
  });
});
