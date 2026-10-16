import { applyMode, resolveMode, saveMode } from '@lamp/ui/themes/theme';
import { useEffect } from 'react';
import { useSettings } from '@/data/use-settings.ts';
import { useMediaQuery } from './use-media-query.ts';

/** Whether the device asks for dark mode, live. */
export function usePrefersDark(): boolean {
  return useMediaQuery('(prefers-color-scheme: dark)');
}

/**
 * Keeps the page in the mode from the user's settings (§8.5): applies it to `<html>`, follows the
 * device while the mode is "system" (Auto), and mirrors it to `localStorage` for the inline script
 * in index.html, which applies it before the first paint of the next visit.
 */
export function useThemeSync(): void {
  const mode = useSettings()?.colorMode;
  const prefersDark = usePrefersDark();
  useEffect(() => {
    if (!mode) return;
    applyMode(document.documentElement, resolveMode(mode, prefersDark));
    saveMode(localStorage, mode);
  }, [mode, prefersDark]);
}
