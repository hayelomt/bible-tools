import { useEffect } from 'react';

/**
 * Keeps the screen on while the component is shown, where the browser allows it (capture mode,
 * wireframes/sermon.md). The browser lets go when the page is hidden, so it's asked again when the
 * page comes back. Refused or unsupported, the screen sleeps as usual.
 */
export function useWakeLock(): void {
  useEffect(() => {
    if (!('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const request = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock
        .request('screen')
        .then((sentinel) => {
          if (gone) void sentinel.release();
          else lock = sentinel;
        })
        .catch(() => {});
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', request);
      void lock?.release().catch(() => {});
    };
  }, []);
}
