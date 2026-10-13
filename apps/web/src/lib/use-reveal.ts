import { useEffect, useRef, useState } from 'react';

/** How long something opened from a search or tag page stays highlighted. */
export const FLASH_MS = 2000;

/**
 * For a row a link asked to show (a search result): scrolls it into view as it first shows, and
 * highlights it for `FLASH_MS`.
 */
export function useReveal<T extends HTMLElement>(reveal: boolean) {
  const ref = useRef<T>(null);
  const [flash, setFlash] = useState(reveal);
  useEffect(() => {
    if (!reveal) return;
    ref.current?.scrollIntoView({ block: 'center' });
    const timer = setTimeout(() => setFlash(false), FLASH_MS);
    return () => clearTimeout(timer);
  }, [reveal]);
  return { ref, flash };
}
