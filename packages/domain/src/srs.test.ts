import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBetween,
  dueDate,
  type Grade,
  GRADES,
  isDue,
  memoryStage,
  MIN_EASE,
  newSrsState,
  nextInterval,
  review,
  type SrsState,
} from './srs.ts';

const DAY = '2026-10-14';

/** Reviews in turn, each on the day the verse is due. */
function reviews(grades: Grade[], from = newSrsState(DAY)): SrsState[] {
  const states: SrsState[] = [];
  let state = from;
  for (const grade of grades) {
    state = review(state, grade, dueDate(state));
    states.push(state);
  }
  return states;
}

describe('a new memory verse', () => {
  it('is due the day it is added, with no reviews', () => {
    const state = newSrsState(DAY);
    expect(state).toEqual({
      ease: 2.5,
      interval: 0,
      nextReviewAt: '2026-10-14T00:00:00.000Z',
      reviewCount: 0,
    });
    expect(isDue(state, DAY)).toBe(true);
    expect(isDue(state, '2026-10-13')).toBe(false);
  });
});

describe('each grade', () => {
  // Four days since the last review, ease 2.5.
  const state: SrsState = {
    ease: 2.5,
    interval: 4,
    nextReviewAt: '2026-10-14T00:00:00.000Z',
    reviewCount: 2,
  };

  it.each([
    ['again', 0, 2.3, '2026-10-14'],
    ['hard', 5, 2.35, '2026-10-19'],
    ['good', 6, 2.5, '2026-10-20'],
    ['easy', 12, 2.65, '2026-10-26'],
  ] as const)('%s: back in %i days, ease %d', (grade, days, ease, due) => {
    const next = review(state, grade, DAY);
    expect(next).toEqual({
      ease,
      interval: days,
      nextReviewAt: `${due}T00:00:00.000Z`,
      reviewCount: 3,
    });
    expect(nextInterval(state, grade)).toBe(days);
  });

  it('gives the wireframe’s days a day after the first review', () => {
    const state1 = { ease: 2.5, interval: 1 };
    expect(GRADES.map((grade) => nextInterval(state1, grade))).toEqual([0, 2, 6, 12]);
  });

  it('multiplies by the ease once the interval is six days or more', () => {
    const long = { ease: 2.5, interval: 10 };
    expect(GRADES.map((grade) => nextInterval(long, grade))).toEqual([0, 12, 25, 50]);
  });

  it('keeps the ease between 1.3 and 10', () => {
    const low = reviews(['again', 'again', 'again', 'again', 'again', 'again', 'again', 'again']);
    expect(low.at(-1)!.ease).toBe(MIN_EASE);
    const high: SrsState = { ...newSrsState(DAY), ease: 9.95 };
    expect(review(high, 'easy', DAY).ease).toBe(10);
  });
});

describe('the first three reviews', () => {
  it('Good each time: 1 day, 6 days, then 15', () => {
    const states = reviews(['good', 'good', 'good']);
    expect(states.map((s) => s.interval)).toEqual([1, 6, 15]);
    expect(states.map(dueDate)).toEqual(['2026-10-15', '2026-10-21', '2026-11-05']);
    expect(states.map((s) => s.reviewCount)).toEqual([1, 2, 3]);
    expect(states.map((s) => s.ease)).toEqual([2.5, 2.5, 2.5]);
  });

  it('Hard each time: 1, 2, then 3 days, with the ease falling', () => {
    const states = reviews(['hard', 'hard', 'hard']);
    expect(states.map((s) => s.interval)).toEqual([1, 2, 3]);
    expect(states.map((s) => s.ease)).toEqual([2.35, 2.2, 2.05]);
  });

  it('Easy each time: 4, 12, then 2 × 12 × 2.8 rounded', () => {
    const states = reviews(['easy', 'easy', 'easy']);
    expect(states.map((s) => s.interval)).toEqual([4, 12, 68]);
    expect(states.map((s) => s.ease)).toEqual([2.65, 2.8, 2.95]);
  });

  it('Again each time: due again the same day, every time', () => {
    const states = reviews(['again', 'again', 'again']);
    expect(states.map((s) => s.interval)).toEqual([0, 0, 0]);
    expect(states.map(dueDate)).toEqual([DAY, DAY, DAY]);
    expect(states.map((s) => s.reviewCount)).toEqual([1, 2, 3]);
  });

  it('Again after two Goods starts over at one day', () => {
    const states = reviews(['good', 'good', 'again', 'good']);
    expect(states.map((s) => s.interval)).toEqual([1, 6, 0, 1]);
    expect(states.at(-1)!.ease).toBe(2.3);
  });
});

describe('progress', () => {
  it('is new, then learning, then known from 21 days, and learning again after Again', () => {
    const states = reviews(['good', 'good', 'good', 'good', 'again']);
    expect(states.map((s) => s.interval)).toEqual([1, 6, 15, 38, 0]);
    expect([newSrsState(DAY), ...states].map(memoryStage)).toEqual([
      'new',
      'learning',
      'learning',
      'learning',
      'known',
      'learning',
    ]);
  });
});

describe('days', () => {
  it('adds across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-14', '2026-11-05')).toBe(22);
    expect(daysBetween('2026-10-14', '2026-10-13')).toBe(-1);
  });
});
