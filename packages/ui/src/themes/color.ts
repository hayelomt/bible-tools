/**
 * Just enough colour maths to check the presets' contrast (TECH-DESIGN §8.5): OKLCH → sRGB,
 * alpha compositing as browsers do it (in gamma-encoded sRGB), and the WCAG 2 contrast ratio.
 */

/** A colour in gamma-encoded sRGB, each channel 0–1, with alpha. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  alpha: number;
}

const fraction = (s: string) => (s.endsWith('%') ? Number(s.slice(0, -1)) / 100 : Number(s));

/** Parses `oklch(L C H)` or `oklch(L C H / A)`, with L and A as numbers or percentages. */
export function parseOklch(value: string): { l: number; c: number; h: number; alpha: number } {
  const match = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/.exec(
    value.trim(),
  );
  if (!match) throw new Error(`Not an oklch() colour: ${value}`);
  return {
    l: fraction(match[1]!),
    c: Number(match[2]),
    h: Number(match[3]),
    alpha: match[4] === undefined ? 1 : fraction(match[4]),
  };
}

/** OKLCH → linear sRGB, unclamped (a channel outside 0–1 means the colour is out of gamut). */
export function oklchToLinearSrgb(value: string): [number, number, number] {
  const { l, c, h } = parseOklch(value);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l3 = (l + 0.396_337_777_4 * a + 0.215_803_757_3 * b) ** 3;
  const m3 = (l - 0.105_561_345_8 * a - 0.063_854_172_8 * b) ** 3;
  const s3 = (l - 0.089_484_177_5 * a - 1.291_485_548 * b) ** 3;
  return [
    4.076_741_662_1 * l3 - 3.307_711_591_3 * m3 + 0.230_969_929_2 * s3,
    -1.268_438_004_6 * l3 + 2.609_757_401_1 * m3 - 0.341_319_396_5 * s3,
    -0.004_196_086_3 * l3 - 0.703_418_614_7 * m3 + 1.707_614_701 * s3,
  ];
}

/** Whether the colour is displayable in sRGB, allowing for rounding. */
export function inSrgbGamut(value: string): boolean {
  return oklchToLinearSrgb(value).every((channel) => channel > -1e-4 && channel < 1 + 1e-4);
}

const encode = (x: number) => (x <= 0.003_130_8 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
const decode = (x: number) => (x <= 0.040_45 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4);
const clamp = (x: number) => Math.min(1, Math.max(0, x));

export function oklchToRgba(value: string): Rgba {
  const [r, g, b] = oklchToLinearSrgb(value).map((x) => encode(clamp(x))) as [
    number,
    number,
    number,
  ];
  return { r, g, b, alpha: parseOklch(value).alpha };
}

/** Paints `top` over `bottom`, as `bg-primary/80` on a page does. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.alpha + bottom.alpha * (1 - top.alpha);
  const mix = (t: number, u: number) =>
    alpha === 0 ? 0 : (t * top.alpha + u * bottom.alpha * (1 - top.alpha)) / alpha;
  return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), alpha };
}

/** Sets a colour's opacity, as Tailwind's `/40` modifier does. */
export function withAlpha(color: Rgba, alpha: number): Rgba {
  return { ...color, alpha: color.alpha * alpha };
}

/** WCAG 2 relative luminance of an opaque colour. */
export function luminance({ r, g, b }: Rgba): number {
  return 0.2126 * decode(r) + 0.7152 * decode(g) + 0.0722 * decode(b);
}

/** WCAG 2 contrast ratio, 1–21. A translucent foreground is first painted over the background. */
export function contrast(foreground: Rgba, background: Rgba): number {
  if (background.alpha < 1) throw new Error('The background must be opaque');
  const [a, b] = [luminance(over(foreground, background)), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
