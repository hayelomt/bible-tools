import { useSyncExternalStore } from 'react';

/** Whether the element takes typing: a text field or an editor. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function subscribe(onChange: () => void) {
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onChange);
  return () => {
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onChange);
  };
}

/** Whether something that takes typing has focus, live: the on-screen keyboard is likely open. */
export function useTyping(): boolean {
  return useSyncExternalStore(subscribe, () => isTyping(document.activeElement));
}
