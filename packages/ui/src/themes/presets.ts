/**
 * The reading-room presets (TECH-DESIGN §8.5, PRD F16). Each has a CSS file in this folder that
 * sets the shadcn tokens for `[data-theme="<id>"]`, and for `[data-theme="<id>"].dark`.
 */
export const PRESETS = [
  {
    id: 'parchment',
    name: 'Parchment',
    description: 'Cream paper, ink brown, burgundy',
    colorScheme: 'light',
  },
  { id: 'vellum', name: 'Vellum', description: 'Off-white, charcoal, gold', colorScheme: 'light' },
  { id: 'olive', name: 'Olive', description: 'Soft sage, deep olive', colorScheme: 'light' },
  { id: 'slate', name: 'Slate', description: 'Cool grey, blue-slate', colorScheme: 'light' },
  { id: 'cedar', name: 'Cedar', description: 'Warm wood, amber', colorScheme: 'light' },
  // Designed dark first: the picker suggests dark mode with it.
  { id: 'midnight', name: 'Midnight', description: 'Deep navy, soft gold', colorScheme: 'dark' },
] as const;

export type PresetId = (typeof PRESETS)[number]['id'];
export type ColorMode = 'light' | 'dark' | 'system';

export const DEFAULT_PRESET: PresetId = 'parchment';

/** The mode to show: "system" follows the device (`prefers-color-scheme: dark`). */
export function resolveMode(mode: ColorMode, prefersDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
}

/** Applies a preset and mode to an element (normally `<html>`). */
export function applyTheme(element: HTMLElement, preset: PresetId, mode: 'light' | 'dark'): void {
  element.dataset['theme'] = preset;
  element.classList.toggle('dark', mode === 'dark');
  element.style.colorScheme = mode;
}

export interface ThemeChoice {
  preset: PresetId;
  mode: ColorMode;
}

/**
 * The device's copy of the choice in `UserSettings`. The inline script in apps/web/index.html
 * reads the same key to apply the theme before the first paint, so keep the two in step.
 */
export const THEME_STORAGE_KEY = 'lamp.theme';

/** The stored choice, or the default for anything missing or unknown. */
export function readTheme(storage: Pick<Storage, 'getItem'>): ThemeChoice {
  let stored: Partial<Record<keyof ThemeChoice, unknown>> = {};
  try {
    stored = JSON.parse(storage.getItem(THEME_STORAGE_KEY) ?? '{}') ?? {};
  } catch {
    // Not JSON: use the default.
  }
  const preset = PRESETS.find((p) => p.id === stored.preset)?.id ?? DEFAULT_PRESET;
  const mode = (['light', 'dark', 'system'] as const).find((m) => m === stored.mode) ?? 'system';
  return { preset, mode };
}

export function saveTheme(storage: Pick<Storage, 'setItem'>, choice: ThemeChoice): void {
  storage.setItem(THEME_STORAGE_KEY, JSON.stringify(choice));
}
