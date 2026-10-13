// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { THEME_PRESETS } from '@lamp/domain';
import { describe, expect, it } from 'vitest';
import globals from '../styles/globals.css?raw';
import {
  contrast,
  inSrgbGamut,
  oklchToRgba,
  over,
  parseOklch,
  type Rgba,
  withAlpha,
} from './color.ts';
import {
  applyTheme,
  PRESETS,
  type PresetId,
  readTheme,
  resolveMode,
  saveTheme,
  THEME_STORAGE_KEY,
} from './presets.ts';

const files = import.meta.glob<string>('./*.css', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/** The tokens each preset sets, in both modes. */
const PRESET_TOKENS = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'primary',
  'primary-foreground',
  'secondary',
  'secondary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'border',
  'input',
  'ring',
];

/** The custom properties set by each CSS rule, keyed by selector. */
function rules(css: string): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  const withoutComments = css.replaceAll(/\/\*[^]*?\*\//g, '');
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = [...body!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name!.slice(2), value!.trim()] as const,
    );
    if (declarations.length > 0) result.set(selector!.trim(), new Map(declarations));
  }
  return result;
}

const shared = rules(globals);

/** Every token of a preset in one mode, with `var()` aliases resolved. */
function tokens(preset: PresetId, mode: 'light' | 'dark'): Map<string, string> {
  const own = rules(files[`./${preset}.css`] ?? '');
  const selector = `[data-theme='${preset}']`;
  const merged = new Map([
    ...shared.get('[data-theme]')!,
    ...(mode === 'dark' ? shared.get('[data-theme].dark')! : []),
    ...(own.get(selector) ?? []),
    ...((mode === 'dark' ? own.get(`${selector}.dark`) : undefined) ?? []),
  ]);
  const resolve = (value: string): string => {
    const alias = /^var\(--([\w-]+)\)$/.exec(value);
    return alias ? resolve(merged.get(alias[1]!) ?? value) : value;
  };
  return new Map([...merged].map(([name, value]) => [name, resolve(value)]));
}

interface Check {
  /** What is being read, as the components combine the tokens. */
  label: string;
  minimum: number;
  /** Only for one mode, when the components style it differently (`dark:` classes). */
  mode?: 'light' | 'dark';
  foreground: (c: (token: string) => Rgba) => Rgba;
  background: (c: (token: string) => Rgba) => Rgba;
}

const TEXT = 4.5; // WCAG 1.4.3, normal-size text
const NON_TEXT = 3; // WCAG 1.4.11, control boundaries, states and focus indicators

const text = (fg: string, bg: string): Check => ({
  label: `${fg} on ${bg}`,
  minimum: TEXT,
  foreground: (c) => c(fg),
  background: (c) => c(bg),
});

/**
 * The colour pairs the components put together (packages/ui/src/components), including the
 * translucent ones: hover states, the destructive button's tinted background, dark inputs.
 */
const CHECKS: Check[] = [
  text('foreground', 'background'),
  text('foreground', 'muted'),
  text('card-foreground', 'card'),
  text('popover-foreground', 'popover'),
  text('primary', 'background'),
  text('primary', 'card'),
  text('primary-foreground', 'primary'),
  text('secondary-foreground', 'secondary'),
  text('muted-foreground', 'background'),
  text('muted-foreground', 'card'),
  text('muted-foreground', 'muted'),
  text('accent-foreground', 'accent'),
  text('destructive', 'background'),
  text('destructive', 'card'),
  text('sidebar-foreground', 'sidebar'),
  text('sidebar-primary-foreground', 'sidebar-primary'),
  text('sidebar-accent-foreground', 'sidebar-accent'),
  ...['yellow', 'green', 'blue', 'pink'].map((colour) => text('foreground', `highlight-${colour}`)),
  {
    label: 'primary-foreground on primary/80 (button hover)',
    minimum: TEXT,
    foreground: (c) => c('primary-foreground'),
    background: (c) => over(withAlpha(c('primary'), 0.8), c('background')),
  },
  {
    label: 'destructive on destructive/10 (destructive button)',
    mode: 'light',
    minimum: TEXT,
    foreground: (c) => c('destructive'),
    background: (c) => over(withAlpha(c('destructive'), 0.1), c('background')),
  },
  {
    label: 'destructive on destructive/20 (destructive button: light hover, dark)',
    minimum: TEXT,
    foreground: (c) => c('destructive'),
    background: (c) => over(withAlpha(c('destructive'), 0.2), c('background')),
  },
  {
    label: 'destructive on destructive/30 (destructive button hover)',
    mode: 'dark',
    minimum: TEXT,
    foreground: (c) => c('destructive'),
    background: (c) => over(withAlpha(c('destructive'), 0.3), c('background')),
  },
  {
    label: 'destructive/90 on card (alert description)',
    minimum: TEXT,
    foreground: (c) => withAlpha(c('destructive'), 0.9),
    background: (c) => c('card'),
  },
  {
    label: 'muted-foreground on input/30 (placeholder in an input)',
    mode: 'dark',
    minimum: TEXT,
    foreground: (c) => c('muted-foreground'),
    background: (c) => over(withAlpha(c('input'), 0.3), c('background')),
  },
  {
    label: 'input on background (field and checkbox borders, unchecked switch)',
    minimum: NON_TEXT,
    foreground: (c) => c('input'),
    background: (c) => c('background'),
  },
  {
    label: 'input on card',
    minimum: NON_TEXT,
    foreground: (c) => c('input'),
    background: (c) => c('card'),
  },
  {
    label: 'input/80 on background (unchecked switch)',
    mode: 'dark',
    minimum: NON_TEXT,
    foreground: (c) => withAlpha(c('input'), 0.8),
    background: (c) => c('background'),
  },
  {
    label: 'primary on background (checked switch and checkbox)',
    minimum: NON_TEXT,
    foreground: (c) => c('primary'),
    background: (c) => c('background'),
  },
  {
    label: 'ring on background (focus border)',
    minimum: NON_TEXT,
    foreground: (c) => c('ring'),
    background: (c) => c('background'),
  },
  {
    label: 'ring on card',
    minimum: NON_TEXT,
    foreground: (c) => c('ring'),
    background: (c) => c('card'),
  },
];

const CASES = PRESETS.flatMap((p) =>
  (['light', 'dark'] as const).map((mode) => [p.id, mode] as const),
);

describe('presets', () => {
  it('match the presets UserSettings accepts', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(THEME_PRESETS);
  });

  it('are all imported by globals.css', () => {
    const imported = [...globals.matchAll(/@import '\.\.\/themes\/(\w+)\.css'/g)].map((m) => m[1]);
    expect(imported).toEqual(PRESETS.map((p) => p.id));
    expect(Object.keys(files).toSorted()).toEqual(PRESETS.map((p) => `./${p.id}.css`).toSorted());
  });

  it.each(PRESETS.map((p) => p.id))('%s sets every token in both modes, and nothing else', (id) => {
    const own = rules(files[`./${id}.css`]!);
    expect([...own.keys()]).toEqual([`[data-theme='${id}']`, `[data-theme='${id}'].dark`]);
    for (const declarations of own.values())
      expect([...declarations.keys()]).toEqual(PRESET_TOKENS);
  });

  it.each(CASES)('%s (%s) uses only opaque, displayable oklch colours', (id, mode) => {
    const outside = [...tokens(id, mode)]
      .filter(([name]) => name !== 'radius')
      .filter(([, value]) => !inSrgbGamut(value) || parseOklch(value).alpha !== 1)
      .map(([name, value]) => `${name}: ${value}`);
    expect(outside).toEqual([]);
  });

  it.each(CASES)('%s (%s) meets WCAG AA contrast', (id, mode) => {
    const values = tokens(id, mode);
    const color = (token: string) => oklchToRgba(values.get(token)!);
    const failures = CHECKS.filter((check) => (check.mode ?? mode) === mode)
      .map((check) => ({
        check,
        ratio: contrast(check.foreground(color), check.background(color)),
      }))
      .filter(({ check, ratio }) => ratio < check.minimum)
      .map(({ check, ratio }) => `${check.label}: ${ratio.toFixed(2)} < ${check.minimum}`);
    expect(failures).toEqual([]);
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    const black = oklchToRgba('oklch(0 0 0)');
    const white = oklchToRgba('oklch(1 0 0)');
    expect(contrast(black, white)).toBeCloseTo(21, 5);
    expect(contrast(white, white)).toBeCloseTo(1, 5);
    // #767676 is the lightest grey with 4.5:1 on white: oklch(0.5659 0 0).
    expect(contrast(oklchToRgba('oklch(0.5659 0 0)'), white)).toBeCloseTo(4.54, 2);
  });

  it('paints a translucent foreground over the background first', () => {
    const white = oklchToRgba('oklch(1 0 0)');
    expect(contrast(oklchToRgba('oklch(0 0 0 / 0%)'), white)).toBeCloseTo(1, 5);
    expect(contrast(oklchToRgba('oklch(0 0 0 / 50%)'), white)).toBeCloseTo(3.98, 2);
  });

  it('rejects a translucent background and anything but oklch()', () => {
    const white = oklchToRgba('oklch(1 0 0)');
    expect(() => contrast(white, withAlpha(white, 0.5))).toThrow('The background must be opaque');
    expect(() => parseOklch('#fff')).toThrow('Not an oklch() colour: #fff');
  });

  it('knows which colours are outside sRGB', () => {
    expect(inSrgbGamut('oklch(0.5 0.1 30)')).toBe(true);
    expect(inSrgbGamut('oklch(0.9 0.3 30)')).toBe(false);
  });
});

describe('theme helpers', () => {
  it('resolves "system" from the device preference', () => {
    expect(resolveMode('system', true)).toBe('dark');
    expect(resolveMode('system', false)).toBe('light');
    expect(resolveMode('light', true)).toBe('light');
    expect(resolveMode('dark', false)).toBe('dark');
  });

  it('applies a preset and mode to an element', () => {
    const element = document.createElement('html');
    applyTheme(element, 'midnight', 'dark');
    expect(element.outerHTML).toBe(
      '<html data-theme="midnight" class="dark" style="color-scheme: dark;"></html>',
    );
    applyTheme(element, 'olive', 'light');
    expect(element.outerHTML).toBe(
      '<html data-theme="olive" class="" style="color-scheme: light;"></html>',
    );
  });

  it('stores the choice, and falls back to the default for anything unknown', () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    expect(readTheme(store)).toEqual({ preset: 'parchment', mode: 'system' });
    saveTheme(store, { preset: 'cedar', mode: 'dark' });
    expect(readTheme(store)).toEqual({ preset: 'cedar', mode: 'dark' });
    storage.set(THEME_STORAGE_KEY, '{"preset":"neon","mode":"dim"}');
    expect(readTheme(store)).toEqual({ preset: 'parchment', mode: 'system' });
    for (const bad of ['not json', 'null', '[1]']) {
      storage.set(THEME_STORAGE_KEY, bad);
      expect(readTheme(store)).toEqual({ preset: 'parchment', mode: 'system' });
    }
  });
});
