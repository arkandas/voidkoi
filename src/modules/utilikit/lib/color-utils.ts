import type { CMYK, HSL, RGB } from '@/modules/utilikit/lib/types';

export const COLOR_FORMATS = ['hex', 'rgb', 'rgba', 'hsl', 'hsla', 'cmyk'] as const;
export type ColorFormat = (typeof COLOR_FORMATS)[number];

export const FORMAT_LABELS: Record<ColorFormat, string> = {
  hex: 'HEX',
  rgb: 'RGB',
  rgba: 'RGBA',
  hsl: 'HSL',
  hsla: 'HSLA',
  cmyk: 'CMYK',
};

export const MAX_RECENT_COLORS = 10;

export interface Color {
  rgb: RGB;
  alpha: number;
}

export interface ParsedColor {
  rgb: RGB;
  alpha?: number;
}

const ALPHA_FORMATS: ReadonlySet<ColorFormat> = new Set(['rgba', 'hsla']);

const NUMBER = String.raw`(\d+(?:\.\d+)?|\.\d+)`;
const HEX_PATTERN = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB_PATTERN = new RegExp(
  String.raw`^rgba?\(\s*${NUMBER}\s*,\s*${NUMBER}\s*,\s*${NUMBER}\s*(?:,\s*${NUMBER}\s*)?\)$`,
  'i'
);
const HSL_PATTERN = new RegExp(
  String.raw`^hsla?\(\s*${NUMBER}\s*,\s*${NUMBER}%\s*,\s*${NUMBER}%\s*(?:,\s*${NUMBER}\s*)?\)$`,
  'i'
);
const CMYK_PATTERN = new RegExp(
  String.raw`^cmyk\(\s*${NUMBER}%?\s*,\s*${NUMBER}%?\s*,\s*${NUMBER}%?\s*,\s*${NUMBER}%?\s*\)$`,
  'i'
);

function clampChannel(value: number): number {
  return Math.round(Math.min(255, Math.max(0, value)));
}

function withAlpha(rgb: RGB, alpha: string | undefined): ParsedColor | null {
  if (alpha === undefined) return { rgb };
  const value = Number(alpha);
  return value <= 1 ? { rgb, alpha: value } : null;
}

export function rgbToHex({ r, g, b }: RGB): string {
  const digits = [r, g, b].map(channel => clampChannel(channel).toString(16).padStart(2, '0'));
  return `#${digits.join('')}`.toUpperCase();
}

export function rgbToHsl({ r, g, b }: RGB): HSL {
  const [red, green, blue] = [r, g, b].map(channel => channel / 255);
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return { h: 0, s: 0, l: Math.round(lightness * 100) };

  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  let hue: number;
  if (max === red) hue = (green - blue) / delta + (green < blue ? 6 : 0);
  else if (max === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return {
    h: Math.round(hue * 60) % 360,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100),
  };
}

function hueToChannel(p: number, q: number, t: number): number {
  let hue = t;
  if (hue < 0) hue += 1;
  if (hue > 1) hue -= 1;
  if (hue < 1 / 6) return p + (q - p) * 6 * hue;
  if (hue < 1 / 2) return q;
  if (hue < 2 / 3) return p + (q - p) * (2 / 3 - hue) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: HSL): RGB {
  const hue = h / 360;
  const saturation = s / 100;
  const lightness = l / 100;

  if (saturation === 0) {
    const gray = clampChannel(lightness * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;

  return {
    r: clampChannel(hueToChannel(p, q, hue + 1 / 3) * 255),
    g: clampChannel(hueToChannel(p, q, hue) * 255),
    b: clampChannel(hueToChannel(p, q, hue - 1 / 3) * 255),
  };
}

export function rgbToCmyk({ r, g, b }: RGB): CMYK {
  const [red, green, blue] = [r, g, b].map(channel => channel / 255);
  const key = 1 - Math.max(red, green, blue);

  if (key === 1) return { c: 0, m: 0, y: 0, k: 100 };

  const ink = (channel: number) => Math.round(((1 - channel - key) / (1 - key)) * 100);
  return { c: ink(red), m: ink(green), y: ink(blue), k: Math.round(key * 100) };
}

export function cmykToRgb({ c, m, y, k }: CMYK): RGB {
  const channel = (ink: number) => clampChannel(255 * (1 - ink / 100) * (1 - k / 100));
  return { r: channel(c), g: channel(m), b: channel(y) };
}

export function parseHex(value: string): ParsedColor | null {
  const match = HEX_PATTERN.exec(value.trim());
  if (!match) return null;

  const digits = match[1].length > 4 ? match[1] : match[1].replace(/./g, digit => digit + digit);
  const channel = (index: number) => parseInt(digits.slice(index * 2, index * 2 + 2), 16);
  const rgb = { r: channel(0), g: channel(1), b: channel(2) };

  return digits.length === 8 ? { rgb, alpha: Math.round((channel(3) / 255) * 100) / 100 } : { rgb };
}

export function parseRgb(value: string): ParsedColor | null {
  const match = RGB_PATTERN.exec(value.trim());
  if (!match) return null;

  const [r, g, b] = match.slice(1, 4).map(Number);
  if (Math.max(r, g, b) > 255) return null;

  return withAlpha({ r: Math.round(r), g: Math.round(g), b: Math.round(b) }, match[4]);
}

export function parseHsl(value: string): ParsedColor | null {
  const match = HSL_PATTERN.exec(value.trim());
  if (!match) return null;

  const [h, s, l] = match.slice(1, 4).map(Number);
  if (h > 360 || s > 100 || l > 100) return null;

  return withAlpha(hslToRgb({ h, s, l }), match[4]);
}

export function parseCmyk(value: string): ParsedColor | null {
  const match = CMYK_PATTERN.exec(value.trim());
  if (!match) return null;

  const [c, m, y, k] = match.slice(1, 5).map(Number);
  if (Math.max(c, m, y, k) > 100) return null;

  return { rgb: cmykToRgb({ c, m, y, k }) };
}

const PARSERS: Record<ColorFormat, (value: string) => ParsedColor | null> = {
  hex: parseHex,
  rgb: parseRgb,
  rgba: parseRgb,
  hsl: parseHsl,
  hsla: parseHsl,
  cmyk: parseCmyk,
};

export function parseColorInput(format: ColorFormat, value: string, currentAlpha: number): Color | null {
  const parsed = PARSERS[format](value);
  if (!parsed) return null;

  return { rgb: parsed.rgb, alpha: parsed.alpha ?? (ALPHA_FORMATS.has(format) ? 1 : currentAlpha) };
}

function formatRgb({ r, g, b }: RGB, alpha?: number): string {
  return alpha === undefined ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function formatHsl({ h, s, l }: HSL, alpha?: number): string {
  return alpha === undefined ? `hsl(${h}, ${s}%, ${l}%)` : `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

export function formatColors({ rgb, alpha }: Color): Record<ColorFormat, string> {
  const hsl = rgbToHsl(rgb);
  const { c, m, y, k } = rgbToCmyk(rgb);

  return {
    hex: rgbToHex(rgb),
    rgb: formatRgb(rgb),
    rgba: formatRgb(rgb, alpha),
    hsl: formatHsl(hsl),
    hsla: formatHsl(hsl, alpha),
    cmyk: `cmyk(${c}%, ${m}%, ${y}%, ${k}%)`,
  };
}

export function parseRecentColors(stored: string | null): string[] {
  if (!stored) return [];

  let value: unknown;
  try {
    value = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];

  const colors = value.flatMap(item => {
    const parsed = typeof item === 'string' ? parseHex(item) : null;
    return parsed ? [rgbToHex(parsed.rgb)] : [];
  });

  return [...new Set(colors)].slice(0, MAX_RECENT_COLORS);
}

export function addRecentColor(colors: readonly string[], color: string): string[] {
  const parsed = parseHex(color);
  if (!parsed) return [...colors];

  const hex = rgbToHex(parsed.rgb);
  return [hex, ...colors.filter(existing => existing !== hex)].slice(0, MAX_RECENT_COLORS);
}
