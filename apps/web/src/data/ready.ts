import { readMode } from '@lamp/ui/themes/theme';
import { startBackgroundWork } from './background.ts';
import { db } from './db.ts';
import { ensureDevice } from './setup.ts';
import { followSettings } from './translation.ts';
import { restoreUnsaved } from './unsaved.ts';

/** The longest the background work waits for the first screen to finish drawing. */
const BACKGROUND_WAIT_MS = 2000;

let deviceReady: Promise<void> | undefined;

/**
 * The device set up once, before the first screen shows (the app's or the print view's): its
 * rows and any unsaved text restored, and the translation picked in Settings read, which every
 * chip quotes (decision 97). The background work starts once the first screen is drawn
 * (the browser is idle), so its worker and database reads don't hold that screen up.
 */
export function whenDeviceReady(): Promise<void> {
  if (!deviceReady) {
    deviceReady = ensureDevice(db, initialTheme())
      .then(() => restoreUnsaved(db))
      .then(followSettings);
    // A failed setup is shown by the route that waits for it.
    void deviceReady.then(
      () => whenIdle(startBackgroundWork),
      () => {},
    );
  }
  return deviceReady;
}

/** Safari has no `requestIdleCallback`. */
function whenIdle(work: () => void) {
  if ('requestIdleCallback' in window) requestIdleCallback(work, { timeout: BACKGROUND_WAIT_MS });
  else setTimeout(work, 500);
}

/** A first run keeps the mode the `localStorage` mirror already shows (§8.5). */
function initialTheme() {
  return { colorMode: readMode(localStorage) };
}
