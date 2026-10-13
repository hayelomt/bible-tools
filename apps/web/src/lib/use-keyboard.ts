import { useSyncExternalStore } from 'react';

/** Less than this is the browser's own bars moving, not an on-screen keyboard. */
const KEYBOARD_MIN_PX = 120;

function subscribe(onChange: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener('resize', onChange);
  viewport?.addEventListener('scroll', onChange);
  return () => {
    viewport?.removeEventListener('resize', onChange);
    viewport?.removeEventListener('scroll', onChange);
  };
}

function inset(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

/**
 * How much of the page the on-screen keyboard covers, in px; 0 when it's closed (UX-PATTERNS
 * "Phone keyboard"). Phones shrink the visual viewport for the keyboard and leave the layout
 * viewport, so a `position: fixed` bar sits on top of the keyboard at `bottom: inset`.
 */
export function useKeyboardInset(): number {
  const px = useSyncExternalStore(subscribe, inset, () => 0);
  return px >= KEYBOARD_MIN_PX ? px : 0;
}
