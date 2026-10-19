// @vitest-environment happy-dom
/// <reference types="vite/client" />
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
import { applyMode, readMode, resolveMode, saveMode, THEME_STORAGE_KEY } from './theme.ts';

/** The palette tokens Lamplight sets, in both modes. */
const PALETTE_TOKENS = [
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

/** The custom properties set by each CSS rule, keyed by selector (repeated rules merged). */
function rules(css: string): Map<string, Map<string, string>> {
  const result = new Map<string, Map<string, string>>();
  const withoutComments = css.replaceAll(/\/\*[^]*?\*\//g, '').replaceAll(/@import[^;]+;/g, '');
  for (const [, selector, body] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = [...body!.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(
      ([, name, value]) => [name!.slice(2), value!.trim()] as const,
    );
    if (declarations.length === 0) continue;
    const key = selector!.trim();
    result.set(key, new Map([...(result.get(key) ?? []), ...declarations]));
  }
  return result;
}

const own = rules(globals);

/** Every token in one mode, with `var()` aliases resolved. */
function tokens(mode: 'light' | 'dark'): Map<string, string> {
  const merged = new Map([
    ...own.get(':root')!,
    ...(mode === 'dark' ? own.get(':root.dark')! : []),
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

const MODES = ['light', 'dark'] as const;

describe('Lamplight', () => {
  it('sets every palette token in both modes', () => {
    expect([...own.get(':root')!.keys()].filter((n) => PALETTE_TOKENS.includes(n))).toEqual(
      PALETTE_TOKENS,
    );
    expect([...own.get(':root.dark')!.keys()].filter((n) => PALETTE_TOKENS.includes(n))).toEqual(
      PALETTE_TOKENS,
    );
  });

  it.each(MODES)('%s uses only opaque, displayable oklch colours', (mode) => {
    expect(outsideGamut(tokens(mode))).toEqual([]);
  });

  it.each(MODES)('%s meets WCAG AA contrast', (mode) => {
    expect(contrastFailures(tokens(mode), mode)).toEqual([]);
  });

  it.each(MODES)('%s: verse chips read on their tint', (mode) => {
    const values = tokens(mode);
    const color = (token: string) => oklchToRgba(values.get(token)!);
    const tint = over(withAlpha(color('primary'), 0.1), color('background'));
    expect(contrast(color('primary'), tint)).toBeGreaterThanOrEqual(TEXT);
  });
});

/** The heat grid's steps, 1–2 notes to 10+ (the theme map, M12-10). */
const HEAT = ['heat-1', 'heat-2', 'heat-3', 'heat-4'];
/** What a cell sits on: the page, a card, and a phone row's hover. */
const HEAT_SURFACES = ['background', 'card', 'muted'];
/** Each step against the one below it, so the scale reads in order without the numbers. */
const HEAT_STEP = 1.4;

describe('the heat grid', () => {
  it.each(MODES)('%s: every step is a cell that reads on its surface', (mode) => {
    const values = tokens(mode);
    const color = (token: string) => oklchToRgba(values.get(token)!);
    // A cell with no notes is a dot in muted-foreground, which reads as text does.
    const failures = [...HEAT, 'muted-foreground'].flatMap((step) =>
      HEAT_SURFACES.map((surface) => ({
        label: `${step} on ${surface}`,
        ratio: contrast(color(step), color(surface)),
      })).filter(({ ratio }) => ratio < NON_TEXT),
    );
    expect(failures.map(({ label, ratio }) => `${label}: ${ratio.toFixed(2)}`)).toEqual([]);
  });

  it.each(MODES)('%s: each step stands apart from the last, away from the page', (mode) => {
    const values = tokens(mode);
    const color = (token: string) => oklchToRgba(values.get(token)!);
    const ratios = HEAT.map((step) => contrast(color(step), color('background')));
    expect(ratios).toEqual(ratios.toSorted((a, b) => a - b));
    for (const [i, step] of HEAT.slice(1).entries()) {
      expect(contrast(color(step), color(HEAT[i]!)), `${HEAT[i]} to ${step}`).toBeGreaterThan(
        HEAT_STEP,
      );
    }
  });
});

function outsideGamut(values: Map<string, string>): string[] {
  return [...values]
    .filter(([name]) => name !== 'radius')
    .filter(([, value]) => !inSrgbGamut(value) || parseOklch(value).alpha !== 1)
    .map(([name, value]) => `${name}: ${value}`);
}

function contrastFailures(values: Map<string, string>, mode: 'light' | 'dark'): string[] {
  const color = (token: string) => oklchToRgba(values.get(token)!);
  return CHECKS.filter((check) => (check.mode ?? mode) === mode)
    .map((check) => ({ check, ratio: contrast(check.foreground(color), check.background(color)) }))
    .filter(({ check, ratio }) => ratio < check.minimum)
    .map(({ check, ratio }) => `${check.label}: ${ratio.toFixed(2)} < ${check.minimum}`);
}

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

  it('applies a mode to an element', () => {
    const element = document.createElement('html');
    applyMode(element, 'dark');
    expect(element.outerHTML).toBe('<html class="dark" style="color-scheme: dark;"></html>');
    applyMode(element, 'light');
    expect(element.outerHTML).toBe('<html class="" style="color-scheme: light;"></html>');
  });

  it('stores the mode, and falls back to "system" for anything unknown', () => {
    const storage = new Map<string, string>();
    const store = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    expect(readMode(store)).toBe('system');
    saveMode(store, 'dark');
    expect(readMode(store)).toBe('dark');
    // A choice saved before the single theme keeps its mode.
    storage.set(THEME_STORAGE_KEY, '{"preset":"cedar","mode":"light","look":"folio"}');
    expect(readMode(store)).toBe('light');
    for (const bad of ['{"mode":"dim"}', 'not json', 'null', '[1]']) {
      storage.set(THEME_STORAGE_KEY, bad);
      expect(readMode(store)).toBe('system');
    }
  });
});
