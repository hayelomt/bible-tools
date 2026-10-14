import { describe, expect, it } from 'vitest';
import { afterGrade, position, startSession, withoutRemoved } from './review-session.ts';

describe('a review session', () => {
  it('goes through the due verses in order', () => {
    let session = startSession(['a', 'b']);
    expect(position(session)).toEqual({ at: 1, of: 2 });
    session = afterGrade(session, 'good');
    expect(session.queue).toEqual(['b']);
    expect(position(session)).toEqual({ at: 2, of: 2 });
    session = afterGrade(session, 'easy');
    expect(session).toEqual({ queue: [], done: 2 });
  });

  it('brings a verse graded Again back at the end, and the count grows', () => {
    let session = afterGrade(startSession(['a', 'b']), 'again');
    expect(session.queue).toEqual(['b', 'a']);
    expect(position(session)).toEqual({ at: 2, of: 3 });
    session = afterGrade(session, 'hard');
    session = afterGrade(session, 'again');
    expect(session.queue).toEqual(['a']);
    expect(position(session)).toEqual({ at: 4, of: 4 });
    expect(afterGrade(session, 'good').queue).toEqual([]);
  });

  it('drops verses removed meanwhile, keeping the same object when none were', () => {
    const session = startSession(['a', 'b', 'c']);
    expect(withoutRemoved(session, new Set(['a', 'b', 'c']))).toBe(session);
    expect(withoutRemoved(session, new Set(['c'])).queue).toEqual(['c']);
  });
});
