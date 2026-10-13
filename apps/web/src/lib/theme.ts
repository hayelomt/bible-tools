import { applyTheme, resolveMode, saveTheme } from '@lamp/ui/themes/presets';
import { useEffect } from 'react';
import { useSettings } from '@/data/use-settings.ts';
import { LOOK_HREFS, showLook } from './looks.ts';
import { useMediaQuery } from './use-media-query.ts';

/** Whether the device asks for dark mode, live. */
export function usePrefersDark(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

/**
 * Keeps the page in the theme from the user's settings (§8.5): applies it to `<html>`, follows the
 * device while the mode is "system", shows the chosen look, and mirrors the choice to
 * `localStorage` for the inline script in index.html, which applies it before the first paint of
 * the next visit.
 */
export function useThemeSync(): void {
  const settings = useSettings();
  const prefersDark = usePrefersDark();
  useEffect(() => {
    if (!settings) return;
    const { themePreset: preset, colorMode: mode, look } = settings;
    applyTheme(document.documentElement, preset, resolveMode(mode, prefersDark));
    saveTheme(
      localStorage,
      look === 'classic'
        ? { preset, mode, look }
        : { preset, mode, look, lookHref: LOOK_HREFS[look] },
    );
  }, [settings, prefersDark]);
  const look = settings?.look;
  useEffect(() => {
    if (look) void showLook(look);
  }, [look]);
}
