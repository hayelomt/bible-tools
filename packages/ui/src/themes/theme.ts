/**
 * The app has one theme, Lamplight (TECH-DESIGN §8.5), in light and dark. Its tokens are in
 * ../styles/globals.css; dark mode is the class `dark` on `<html>`.
 */
export type ColorMode = 'light' | 'dark' | 'system';

export const COLOR_MODE_OPTIONS = ['light', 'dark', 'system'] as const;

/** The mode to show: "system" follows the device (`prefers-color-scheme: dark`). */
export function resolveMode(mode: ColorMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** Applies a mode to an element (normally `<html>`). */
export function applyMode(element: HTMLElement, mode: 'light' | 'dark'): void {
  element.classList.toggle('dark', mode === 'dark');
  element.style.colorScheme = mode;
}

/**
 * The device's copy of the mode in `UserSettings`. The inline script in apps/web/index.html
 * reads the same key to apply it before the first paint, so keep the two in step.
 */
export const THEME_STORAGE_KEY = 'lamp.theme';

/** The stored mode, or "system" for anything missing or unknown. */
export function readMode(storage: Pick<Storage, 'getItem'>): ColorMode {
  let stored: { mode?: unknown } = {};
  try {
    stored = JSON.parse(storage.getItem(THEME_STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Not JSON: use the default.
  }
  return COLOR_MODE_OPTIONS.find((m) => m === stored.mode) ?? 'system';
}

export function saveMode(storage: Pick<Storage, 'setItem'>, mode: ColorMode): void {
  storage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode }));
}
