import { useEffect, useState } from 'react';

/**
 * Whether `ms` have passed since the component mounted: loading states show only after 300 ms
 * (wireframes/states.md "Loading"), so quick work never flashes one.
 */
export function useAfter(ms: number): boolean {
  const [passed, setPassed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setPassed(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return passed;
}
