import { useEffect } from 'react';

/**
 * The lesson open most recently on this device, and when it was last on screen, for the share
 * screen's "Add to current lesson" (F18, wireframes/interop.md "Share landing"). Kept in this
 * browser only: it's about this device's screen, not the account.
 */
export const RECENT_LESSON_KEY = 'lamp.recentLesson';

/** How long after leaving a lesson a share still offers it. */
export const RECENT_LESSON_MS = 10 * 60 * 1000;
/** How often an open lesson notes that it's still on screen. */
const TICK_MS = 30_000;

interface Recent {
  id: string;
  /** When it was last on screen, in ms since the epoch. */
  at: number;
}

function note(id: string) {
  try {
    localStorage.setItem(
      RECENT_LESSON_KEY,
      JSON.stringify({ id, at: Date.now() } satisfies Recent),
    );
  } catch {
    // Storage blocked or full: a share just doesn't offer the lesson.
  }
}

/** The lesson on screen in the last 10 minutes, if any. */
export function recentLessonId(now = Date.now()): string | null {
  try {
    const recent = JSON.parse(localStorage.getItem(RECENT_LESSON_KEY) ?? 'null') as Recent | null;
    if (!recent || typeof recent.id !== 'string' || typeof recent.at !== 'number') return null;
    return now - recent.at <= RECENT_LESSON_MS ? recent.id : null;
  } catch {
    return null;
  }
}

/** Notes the lesson as on screen while it's shown and visible, and once more as it goes. */
export function useRecentLesson(id: string | null) {
  useEffect(() => {
    if (!id) return;
    const visible = () => document.visibilityState === 'visible';
    note(id);
    const timer = setInterval(() => visible() && note(id), TICK_MS);
    // Hidden (another app opened to share from): it was on screen until now.
    const onVisibility = () => note(id);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      note(id);
    };
  }, [id]);
}
