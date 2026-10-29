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

/**
 * How tight the interface is and how large its text, per device: a phone and a laptop can differ,
 * so neither is in `UserSettings`. Density scales Tailwind's `--spacing`, text size the `--text-*`
 * sizes (globals.css); the 44 px touch target stays fixed. "default" sets no attribute.
 */
export type Density = 'compact' | 'default' | 'roomy';
export type TextSize = 'small' | 'default' | 'large' | 'larger';

export const DENSITY_OPTIONS = ['compact', 'default', 'roomy'] as const;
export const TEXT_SIZE_OPTIONS = ['small', 'default', 'large', 'larger'] as const;

export interface Display {
  density: Density;
  textSize: TextSize;
}

export const DEFAULT_DISPLAY: Display = { density: 'default', textSize: 'default' };

/** Read by the inline script in apps/web/index.html as well, so keep the two in step. */
export const DISPLAY_STORAGE_KEY = 'lamp.display';

/** The stored density and text size, each "default" when missing or unknown. */
export function readDisplay(storage: Pick<Storage, 'getItem'>): Display {
  let stored: { density?: unknown; textSize?: unknown } = {};
  try {
    stored = JSON.parse(storage.getItem(DISPLAY_STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Not JSON: use the defaults.
  }
  return {
    density: DENSITY_OPTIONS.find((d) => d === stored.density) ?? 'default',
    textSize: TEXT_SIZE_OPTIONS.find((s) => s === stored.textSize) ?? 'default',
  };
}

export function saveDisplay(storage: Pick<Storage, 'setItem'>, display: Display): void {
  storage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify(display));
}

/** Applies a density and text size to an element (normally `<html>`) as `data-` attributes. */
export function applyDisplay(element: HTMLElement, display: Display): void {
  for (const [name, value] of [
    ['data-density', display.density],
    ['data-text-size', display.textSize],
  ] as const) {
    if (value === 'default') element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}
