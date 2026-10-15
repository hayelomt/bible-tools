import { toast } from '@lamp/ui/components/sonner';
import { useEffect } from 'react';
import { install, installLater, useInstallWay } from '@/lib/install.ts';
import { useTyping } from '@/lib/is-typing.ts';
import { useWelcomed } from '@/lib/welcome.ts';

/**
 * Offers to install the app when it loads in a browser that can (wireframes/shell.md "Install
 * prompt"): a toast that stays until it's used. Chromium shows its own install dialog; on an
 * iPhone or iPad it says how to add Lamp from the Share menu. "Not now" puts it off for two weeks
 * on this device; once installed it isn't offered. Put away while something is being typed, and
 * held back on a new device until the welcome is done, so it doesn't cover Continue.
 */
export function InstallPrompt() {
  const way = useInstallWay();
  const typing = useTyping();
  const welcomed = useWelcomed();

  useEffect(() => {
    if (!way || typing || !welcomed) return;
    const id =
      way === 'prompt'
        ? toast('Install Lamp to open it from your home screen and use it offline.', {
            duration: Infinity,
            cancel: { label: 'Not now', onClick: installLater },
            action: { label: 'Install', onClick: () => void install() },
          })
        : toast('Install Lamp: tap Share, then Add to Home Screen.', {
            duration: Infinity,
            action: { label: 'OK', onClick: installLater },
          });
    return () => {
      toast.dismiss(id);
    };
  }, [way, typing, welcomed]);

  return null;
}
