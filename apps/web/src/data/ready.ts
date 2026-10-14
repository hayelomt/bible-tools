import { readTheme } from '@lamp/ui/themes/presets';
import { startBackgroundWork } from './background.ts';
import { db } from './db.ts';
import { ensureDevice } from './setup.ts';
import { restoreUnsaved } from './unsaved.ts';

let deviceReady: Promise<void> | undefined;

/**
 * The device set up once, before the first screen shows (the app's or the print view's): its
 * rows, any unsaved text restored, and the background work started.
 */
export function whenDeviceReady(): Promise<void> {
  deviceReady ??= ensureDevice(db, initialTheme())
    .then(() => restoreUnsaved(db))
    .then(startBackgroundWork);
  return deviceReady;
}

/** A first run keeps the theme the `localStorage` mirror already shows (§8.5). */
function initialTheme() {
  const { preset, mode, look } = readTheme(localStorage);
  return { themePreset: preset, colorMode: mode, look };
}
