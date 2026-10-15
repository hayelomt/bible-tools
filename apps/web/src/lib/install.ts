import { useSyncExternalStore } from 'react';

/** Chromium's install event (not in the DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** When the install offer was last put off on this device. */
export const INSTALL_LATER_KEY = 'lamp.installLater';
/** How long "Not now" puts the offer off. */
export const INSTALL_LATER_MS = 14 * 24 * 60 * 60 * 1000;

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

// Listened for as soon as the app loads: the browser can fire it before the shell renders.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // The app offers it itself, instead of the browser's mini-infobar.
    event.preventDefault();
    deferred = event as BeforeInstallPromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    changed();
  });
}

/** Whether the app is running installed, in its own window. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  );
}

/** iPhone or iPad, where Safari has no install event and the user adds it from the Share menu. */
export function isIos(): boolean {
  return (
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    // An iPad asks for the desktop site and says it's a Mac.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * How the app can be installed here: `prompt` when the browser has offered it (Chromium), `ios`
 * for the Share menu, or null when it's installed, can't be, or the offer was put off lately.
 */
export type InstallWay = 'prompt' | 'ios' | null;

function installWay(): InstallWay {
  if (putOff()) return null;
  if (deferred) return 'prompt';
  if (isIos() && !isStandalone()) return 'ios';
  return null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** How the app can be installed now, re-rendering when that changes. */
export function useInstallWay(): InstallWay {
  return useSyncExternalStore(subscribe, installWay);
}

/** Shows the browser's install dialog; the offer goes away whatever the answer. */
export async function install(): Promise<void> {
  const event = deferred;
  if (!event) return;
  deferred = null;
  changed();
  await event.prompt();
  if ((await event.userChoice).outcome === 'dismissed') installLater();
}

/** Puts the offer off for `INSTALL_LATER_MS` on this device. */
export function installLater(): void {
  try {
    localStorage.setItem(INSTALL_LATER_KEY, String(Date.now()));
  } catch {
    // Not remembered: it's offered again on the next load.
  }
  changed();
}

function putOff(): boolean {
  try {
    const at = Number(localStorage.getItem(INSTALL_LATER_KEY));
    return at > 0 && Date.now() - at < INSTALL_LATER_MS;
  } catch {
    return false;
  }
}
