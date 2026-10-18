import { afterEach, describe, expect, it } from 'vitest';
import { RECENT_LESSON_KEY, RECENT_LESSON_MS, recentLessonId } from './recent-lesson.ts';

afterEach(() => {
  localStorage.clear();
});

describe('recentLessonId', () => {
  it('is the lesson on screen in the last 10 minutes', () => {
    localStorage.setItem(RECENT_LESSON_KEY, JSON.stringify({ id: 'a', at: 1_000 }));
    expect(recentLessonId(1_000 + RECENT_LESSON_MS)).toBe('a');
    expect(recentLessonId(1_001 + RECENT_LESSON_MS)).toBeNull();
  });

  it('is none without one, or with something else stored', () => {
    expect(recentLessonId()).toBeNull();
    localStorage.setItem(RECENT_LESSON_KEY, 'not json');
    expect(recentLessonId()).toBeNull();
    localStorage.setItem(RECENT_LESSON_KEY, JSON.stringify({ id: 3 }));
    expect(recentLessonId()).toBeNull();
  });
});
