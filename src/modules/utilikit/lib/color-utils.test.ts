import { describe, expect, it } from 'vitest';
import {
  addRecentColor,
  cmykToRgb,
  COLOR_FORMATS,
  type ColorFormat,
  formatColors,
  hslToRgb,
  MAX_RECENT_COLORS,
  parseCmyk,
  parseColorInput,
  parseHex,
  parseHsl,
  parseRecentColors,
  parseRgb,
  rgbToCmyk,
  rgbToHex,
  rgbToHsl,
} from '@/modules/utilikit/lib/color-utils';
import type { RGB } from '@/modules/utilikit/lib/types';

const RED: RGB = { r: 255, g: 0, b: 0 };
const GRAY: RGB = { r: 128, g: 128, b: 128 };
const REBECCA_PURPLE: RGB = { r: 102, g: 51, b: 153 };

const CHANNEL_SAMPLES = [0, 1, 17, 51, 87, 118, 128, 160, 199, 220, 254, 255];
const SAMPLE_COLORS: RGB[] = CHANNEL_SAMPLES.flatMap(r =>
  CHANNEL_SAMPLES.flatMap(g => CHANNEL_SAMPLES.map(b => ({ r, g, b })))
);

function channelError(a: RGB, b: RGB): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function parseOrThrow(format: ColorFormat, value: string, alpha: number) {
  const parsed = parseColorInput(format, value, alpha);
  if (!parsed) throw new Error(`Could not parse ${format} value ${value}`);
  return parsed;
}

describe('known conversions', () => {
  it('converts #ff0000 to rgb(255, 0, 0), hsl(0, 100%, 50%) and cmyk(0, 100, 100, 0)', () => {
    expect(parseHex('#ff0000')).toEqual({ rgb: RED });
    expect(rgbToHex(RED)).toBe('#FF0000');
    expect(rgbToHsl(RED)).toEqual({ h: 0, s: 100, l: 50 });
    expect(rgbToCmyk(RED)).toEqual({ c: 0, m: 100, y: 100, k: 0 });
    expect(hslToRgb({ h: 0, s: 100, l: 50 })).toEqual(RED);
    expect(cmykToRgb({ c: 0, m: 100, y: 100, k: 0 })).toEqual(RED);
  });

  it('converts mid gray #808080', () => {
    expect(parseHex('#808080')).toEqual({ rgb: GRAY });
    expect(rgbToHsl(GRAY)).toEqual({ h: 0, s: 0, l: 50 });
    expect(rgbToCmyk(GRAY)).toEqual({ c: 0, m: 0, y: 0, k: 50 });
    expect(hslToRgb({ h: 0, s: 0, l: 50 })).toEqual(GRAY);
    expect(cmykToRgb({ c: 0, m: 0, y: 0, k: 50 })).toEqual(GRAY);
  });

  it('matches the CSS definitions of named colors', () => {
    expect(rgbToHsl({ r: 0, g: 128, b: 0 })).toEqual({ h: 120, s: 100, l: 25 });
    expect(hslToRgb({ h: 120, s: 100, l: 25 })).toEqual({ r: 0, g: 128, b: 0 });
    expect(rgbToHsl({ r: 0, g: 0, b: 255 })).toEqual({ h: 240, s: 100, l: 50 });
    expect(rgbToHsl(REBECCA_PURPLE)).toEqual({ h: 270, s: 50, l: 40 });
    expect(hslToRgb({ h: 270, s: 50, l: 40 })).toEqual(REBECCA_PURPLE);
  });

  it('handles black and white in CMYK', () => {
    expect(rgbToCmyk({ r: 0, g: 0, b: 0 })).toEqual({ c: 0, m: 0, y: 0, k: 100 });
    expect(rgbToCmyk({ r: 255, g: 255, b: 255 })).toEqual({ c: 0, m: 0, y: 0, k: 0 });
    expect(cmykToRgb({ c: 0, m: 0, y: 0, k: 100 })).toEqual({ r: 0, g: 0, b: 0 });
  });
});

describe('parseHex', () => {
  it('expands 3-digit shorthand and accepts a missing # or surrounding spaces', () => {
    expect(parseHex('#f00')).toEqual({ rgb: RED });
    expect(parseHex('F00')).toEqual({ rgb: RED });
    expect(parseHex('  #FF0000  ')).toEqual({ rgb: RED });
  });

  it('reads the alpha channel of 4- and 8-digit hex', () => {
    expect(parseHex('#ff000080')).toEqual({ rgb: RED, alpha: 0.5 });
    expect(parseHex('#FF0000FF')).toEqual({ rgb: RED, alpha: 1 });
    expect(parseHex('#00000000')).toEqual({ rgb: { r: 0, g: 0, b: 0 }, alpha: 0 });
    expect(parseHex('#f008')).toEqual({ rgb: RED, alpha: 0.53 });
  });

  it('rejects invalid input', () => {
    for (const value of ['', '#', '#ff', '#ff000', '#ff0000f', '#ff0000000', '#gg0000', 'red', 'rgb(255, 0, 0)']) {
      expect(parseHex(value), value).toBeNull();
    }
  });
});

describe('rgbToHex', () => {
  it('pads, rounds and clamps channels', () => {
    expect(rgbToHex({ r: 0, g: 10, b: 255 })).toBe('#000AFF');
    expect(rgbToHex({ r: 300, g: -20, b: 127.6 })).toBe('#FF0080');
  });
});

describe('text parsers', () => {
  it('parses rgb() and rgba()', () => {
    expect(parseRgb('rgb(255, 0, 0)')).toEqual({ rgb: RED });
    expect(parseRgb('RGB(255,0,0)')).toEqual({ rgb: RED });
    expect(parseRgb('rgba(255, 0, 0, 0.25)')).toEqual({ rgb: RED, alpha: 0.25 });
    expect(parseRgb('rgba(255, 0, 0, .5)')).toEqual({ rgb: RED, alpha: 0.5 });
  });

  it('rejects out-of-range or malformed rgb()', () => {
    for (const value of ['rgb(256, 0, 0)', 'rgb(255, 0)', 'rgba(0, 0, 0, 1.5)', 'rgb(-1, 0, 0)', 'rgb(a, b, c)', '255, 0, 0']) {
      expect(parseRgb(value), value).toBeNull();
    }
  });

  it('parses hsl() and hsla(), including a hue of 360', () => {
    expect(parseHsl('hsl(0, 100%, 50%)')).toEqual({ rgb: RED });
    expect(parseHsl('hsl(360, 100%, 50%)')).toEqual({ rgb: RED });
    expect(parseHsl('hsla(270, 50%, 40%, 0.8)')).toEqual({ rgb: REBECCA_PURPLE, alpha: 0.8 });
  });

  it('rejects out-of-range or malformed hsl()', () => {
    for (const value of ['hsl(361, 100%, 50%)', 'hsl(0, 101%, 50%)', 'hsl(0, 100%, 101%)', 'hsl(0, 100, 50)', 'hsla(0, 100%, 50%, 2)']) {
      expect(parseHsl(value), value).toBeNull();
    }
  });

  it('parses cmyk() with or without percent signs', () => {
    expect(parseCmyk('cmyk(0%, 100%, 100%, 0%)')).toEqual({ rgb: RED });
    expect(parseCmyk('cmyk(0, 100, 100, 0)')).toEqual({ rgb: RED });
    expect(parseCmyk('cmyk(0, 0, 0, 101)')).toBeNull();
    expect(parseCmyk('cmyk(0, 0, 0)')).toBeNull();
  });
});

describe('parseColorInput', () => {
  it('keeps the current alpha for formats without an alpha channel', () => {
    expect(parseColorInput('hex', '#ff0000', 0.4)).toEqual({ rgb: RED, alpha: 0.4 });
    expect(parseColorInput('rgb', 'rgb(255, 0, 0)', 0.4)).toEqual({ rgb: RED, alpha: 0.4 });
    expect(parseColorInput('hsl', 'hsl(0, 100%, 50%)', 0.4)).toEqual({ rgb: RED, alpha: 0.4 });
    expect(parseColorInput('cmyk', 'cmyk(0, 100, 100, 0)', 0.4)).toEqual({ rgb: RED, alpha: 0.4 });
  });

  it('takes the alpha from the value when it has one', () => {
    expect(parseColorInput('hex', '#ff000080', 1)).toEqual({ rgb: RED, alpha: 0.5 });
    expect(parseColorInput('rgb', 'rgba(255, 0, 0, 0.3)', 1)).toEqual({ rgb: RED, alpha: 0.3 });
    expect(parseColorInput('hsla', 'hsla(0, 100%, 50%, 0.3)', 1)).toEqual({ rgb: RED, alpha: 0.3 });
  });

  it('treats a value without alpha in an alpha format as opaque', () => {
    expect(parseColorInput('rgba', 'rgb(255, 0, 0)', 0.4)).toEqual({ rgb: RED, alpha: 1 });
    expect(parseColorInput('hsla', 'hsl(0, 100%, 50%)', 0.4)).toEqual({ rgb: RED, alpha: 1 });
  });

  it('returns null for text that does not match the format', () => {
    expect(parseColorInput('hex', 'rgb(255, 0, 0)', 1)).toBeNull();
    expect(parseColorInput('hsl', '#ff0000', 1)).toBeNull();
    expect(parseColorInput('cmyk', '', 1)).toBeNull();
  });
});

describe('formatColors', () => {
  it('formats every representation', () => {
    expect(formatColors({ rgb: RED, alpha: 0.5 })).toEqual({
      hex: '#FF0000',
      rgb: 'rgb(255, 0, 0)',
      rgba: 'rgba(255, 0, 0, 0.5)',
      hsl: 'hsl(0, 100%, 50%)',
      hsla: 'hsla(0, 100%, 50%, 0.5)',
      cmyk: 'cmyk(0%, 100%, 100%, 0%)',
    });
  });

  it('produces strings that parse back to the same color', () => {
    for (const rgb of SAMPLE_COLORS) {
      const formatted = formatColors({ rgb, alpha: 0.75 });
      for (const format of COLOR_FORMATS) {
        const parsed = parseOrThrow(format, formatted[format], 0.75);
        const tolerance = format === 'hsl' || format === 'hsla' || format === 'cmyk' ? 3 : 0;
        expect(channelError(parsed.rgb, rgb), formatted[format]).toBeLessThanOrEqual(tolerance);
        expect(parsed.alpha).toBe(0.75);
      }
    }
  });
});

describe('round trips', () => {
  it('rgb → hex → rgb is lossless', () => {
    for (const rgb of SAMPLE_COLORS) {
      expect(parseHex(rgbToHex(rgb))).toEqual({ rgb });
    }
  });

  it('rgb → hsl → rgb stays within the rounding of whole degrees and percentages', () => {
    for (const rgb of SAMPLE_COLORS) {
      expect(channelError(hslToRgb(rgbToHsl(rgb)), rgb)).toBeLessThanOrEqual(3);
    }
  });

  it('rgb → cmyk → rgb stays within the rounding of whole percentages', () => {
    for (const rgb of SAMPLE_COLORS) {
      expect(channelError(cmykToRgb(rgbToCmyk(rgb)), rgb)).toBeLessThanOrEqual(3);
    }
  });
});

describe('recent colors', () => {
  it('ignores missing or malformed storage', () => {
    expect(parseRecentColors(null)).toEqual([]);
    expect(parseRecentColors('not json')).toEqual([]);
    expect(parseRecentColors('{"color":"#fff"}')).toEqual([]);
  });

  it('normalizes, de-duplicates and drops invalid entries', () => {
    expect(parseRecentColors(JSON.stringify(['#3b82f6', '#3B82F6', 'nope', 5, '#fff']))).toEqual([
      '#3B82F6',
      '#FFFFFF',
    ]);
  });

  it('keeps at most ten stored colors', () => {
    const many = Array.from({ length: 15 }, (_, index) => rgbToHex({ r: index, g: 0, b: 0 }));
    expect(MAX_RECENT_COLORS).toBe(10);
    expect(parseRecentColors(JSON.stringify(many))).toEqual(many.slice(0, 10));
  });

  it('moves a re-used color to the front', () => {
    expect(addRecentColor(['#FF0000', '#00FF00'], '#00ff00')).toEqual(['#00FF00', '#FF0000']);
  });

  it('drops the oldest color when the list is full', () => {
    const full = Array.from({ length: 10 }, (_, index) => rgbToHex({ r: index, g: 0, b: 0 }));
    const next = addRecentColor(full, '#fff');
    expect(next).toHaveLength(10);
    expect(next[0]).toBe('#FFFFFF');
    expect(next).not.toContain(full[9]);
  });

  it('ignores invalid colors without mutating the list', () => {
    const colors = ['#FF0000'];
    const next = addRecentColor(colors, 'nope');
    expect(next).toEqual(['#FF0000']);
    expect(next).not.toBe(colors);
  });
});
