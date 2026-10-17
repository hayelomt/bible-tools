import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ScreenWait, setScreenTracer, useScreenReady } from './screen-ready.ts';

/** A tracer that records each wait it opens and how it ended. */
function fakeTracer() {
  const ends = vi.fn<(screen: string, outcome: string) => void>();
  const opened = vi.fn<(screen: string, startedAt: number) => ScreenWait>((screen) => ({
    end: (outcome) => ends(screen, outcome),
  }));
  setScreenTracer(opened);
  return { opened, ends };
}

afterEach(() => setScreenTracer(undefined));

describe('useScreenReady', () => {
  it('opens the wait on first render and ends it once the data is there', () => {
    const { opened, ends } = fakeTracer();
    const { rerender } = renderHook(({ ready }) => useScreenReady('review', ready), {
      initialProps: { ready: false },
    });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(ends).not.toHaveBeenCalled();

    rerender({ ready: true });
    rerender({ ready: false });
    rerender({ ready: true });
    expect(ends.mock.calls).toEqual([['review', 'ready']]);
    expect(opened).toHaveBeenCalledTimes(1);
  });

  it('ends the wait as left when the screen goes before its data', () => {
    const { ends } = fakeTracer();
    const { unmount } = renderHook(() => useScreenReady('lessons', false));
    unmount();
    expect(ends.mock.calls).toEqual([['lessons', 'left']]);
  });

  it('times from first render when Sentry starts while the screen waits', () => {
    const { rerender } = renderHook(({ ready }) => useScreenReady('lesson', ready), {
      initialProps: { ready: false },
    });
    const { opened, ends } = fakeTracer();
    const before = Date.now();
    rerender({ ready: true });
    expect(opened).toHaveBeenCalledTimes(1);
    expect(opened.mock.calls[0]?.[1]).toBeLessThanOrEqual(before);
    expect(ends.mock.calls).toEqual([['lesson', 'ready']]);
  });

  it('does nothing without Sentry', () => {
    const { rerender, unmount } = renderHook(({ ready }) => useScreenReady('review', ready), {
      initialProps: { ready: false },
    });
    rerender({ ready: true });
    expect(() => unmount()).not.toThrow();
  });
});
