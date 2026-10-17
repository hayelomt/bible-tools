import { useEffect, useRef, useState } from 'react';

/** A screen's wait for its data, as Sentry records it: open until the data is there. */
export interface ScreenWait {
  end(outcome: 'ready' | 'left'): void;
}

type Tracer = (screen: string, startedAt: number) => ScreenWait;

let tracer: Tracer | undefined;

/**
 * Times how long a screen shows its skeleton before its data arrives from IndexedDB, which the
 * navigation trace can't see on its own: the route counts as rendered while `useLiveQuery` is
 * still reading. Once Sentry is on (`src/lib/sentry.ts`) the wait is a span inside the
 * navigation, so the navigation lasts until the screen is filled. Without Sentry it does nothing.
 * Timed once per visit, from the screen's first render.
 */
export function useScreenReady(screen: string, ready: boolean): void {
  const [startedAt] = useState(Date.now);
  const wait = useRef<ScreenWait | undefined>(undefined);
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (ready) {
      done.current = true;
      // Sentry may have started while the screen waited: the span then starts back at first render.
      (wait.current ?? tracer?.(screen, startedAt))?.end('ready');
      wait.current = undefined;
    } else {
      wait.current ??= tracer?.(screen, startedAt);
    }
  }, [screen, ready, startedAt]);

  // Left before the data came: an open span would hold the navigation open for 30 seconds.
  useEffect(
    () => () => {
      wait.current?.end('left');
      wait.current = undefined;
    },
    [],
  );
}

/** Called once Sentry has started; the screens that wait from then on are timed. */
export function setScreenTracer(next: Tracer | undefined): void {
  tracer = next;
}
