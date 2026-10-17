import { useEffect, useState } from 'react';
import { today } from './dates.ts';

/** Today on this device, read again when the app comes back into view, so a new day counts. */
export function useToday(): string {
  const [day, setDay] = useState(today);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setDay(today());
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return day;
}
