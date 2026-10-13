import { applyTheme, resolveMode, saveTheme } from '@lamp/ui/themes/presets';
import { useEffect, useSyncExternalStore } from 'react';
import { useSettings } from '@/data/use-settings.ts';

const darkQuery = () => matchMedia('(prefers-color-scheme: dark)');

/** Whether the device asks for dark mode, live. */
export function usePrefersDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = darkQuery();
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    },
    () => darkQuery().matches,
  );
}

/**
 * Keeps the page in the theme from the user's settings (§8.5): applies it to `<html>`, follows the
 * device while the mode is "system", and mirrors the choice to `localStorage` for the inline
 * script in index.html, which applies it before the first paint of the next visit.
 */
export function useThemeSync(): void {
  const settings = useSettings();
  const prefersDark = usePrefersDark();
  useEffect(() => {
    if (!settings) return;
    const { themePreset: preset, colorMode: mode } = settings;
    applyTheme(document.documentElement, preset, resolveMode(mode, prefersDark));
    saveTheme(localStorage, { preset, mode });
  }, [settings, prefersDark]);
}
