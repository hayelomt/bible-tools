import { toast } from '@lamp/ui/components/sonner';
import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { writesSettled } from '@/data/action.ts';
import { isTyping } from '@/lib/is-typing.ts';

/** How often an open app looks for a new version. */
const CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker, and offers a new version once it's ready (wireframes/shell.md
 * "Update prompt"): a toast that stays until it's used. The app never reloads by itself, and the
 * toast is put away while something is being typed, so a reload never lands mid-edit; Reload
 * waits for the last writes first. Later leaves the update for the next start. (M3-09 also holds
 * it back while the outbox is mid-push.)
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update(), CHECK_MS);
    },
    onRegisterError: (error: unknown) =>
      console.error('Registering the service worker failed', error),
  });
  const typing = useTyping();

  useEffect(() => {
    if (!needRefresh || typing) return;
    const id = toast('A new version of Lamp is ready.', {
      duration: Infinity,
      cancel: { label: 'Later', onClick: () => setNeedRefresh(false) },
      action: {
        label: 'Reload',
        onClick: () => {
          void writesSettled().then(() => {
            // The plugin reloads only for an update found just after the page loaded; one found
            // later (the hourly check, another tab) is reloaded for here.
            navigator.serviceWorker?.addEventListener('controllerchange', reload, { once: true });
            return updateServiceWorker(true);
          });
        },
      },
    });
    return () => {
      toast.dismiss(id);
    };
  }, [needRefresh, typing, setNeedRefresh, updateServiceWorker]);

  return null;
}

function reload() {
  window.location.reload();
}

/** Whether focus is in a text field or an editor, live. */
function useTyping(): boolean {
  const [typing, setTyping] = useState(() => isTyping(document.activeElement));
  useEffect(() => {
    // After focus has moved: on focusout, `activeElement` is still the old element.
    const update = () => setTimeout(() => setTyping(isTyping(document.activeElement)), 0);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return typing;
}
