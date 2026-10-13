import { readTheme } from '@lamp/ui/themes/presets';
import { createFileRoute } from '@tanstack/react-router';
import { AppShell } from '@/components/shell/app-shell.tsx';
import { db } from '@/data/db.ts';
import { ensureDevice } from '@/data/setup.ts';

let deviceReady: Promise<void> | undefined;

/** Every screen of the app, inside the shell. The device is set up before the first one shows. */
export const Route = createFileRoute('/_app')({
  beforeLoad: () => {
    deviceReady ??= ensureDevice(db, initialTheme());
    return deviceReady;
  },
  component: AppShell,
});

/** A first run keeps the theme the `localStorage` mirror already shows (§8.5). */
function initialTheme() {
  const { preset, mode } = readTheme(localStorage);
  return { themePreset: preset, colorMode: mode };
}
