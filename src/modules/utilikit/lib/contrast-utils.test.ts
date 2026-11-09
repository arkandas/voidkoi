import { describe, expect, it } from 'vitest';
import {
  checkContrast,
  contrastRatio,
  parseOpaqueHex,
  relativeLuminance,
  suggestForegrounds,
  truncateRatio,
  WCAG_THRESHOLDS,
} from '@/modules/utilikit/lib/contrast-utils';
import type { RGB } from '@/modules/utilikit/lib/types';

function hex(value: string): RGB {
  const rgb = parseOpaqueHex(value);
  if (!rgb) throw new Error(`Invalid test color ${value}`);
  return rgb;
}

const WHITE = hex('#FFFFFF');
const BLACK = hex('#000000');

describe('relativeLuminance', () => {
  it('matches the WCAG definition for black, white and the primaries', () => {
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 10);
    expect(relativeLuminance(hex('#FF0000'))).toBeCloseTo(0.2126, 10);
    expect(relativeLuminance(hex('#00FF00'))).toBeCloseTo(0.7152, 10);
    expect(relativeLuminance(hex('#0000FF'))).toBeCloseTo(0.0722, 10);
  });
});

describe('contrastRatio', () => {
  it('is 21:1 for black on white and 1:1 for identical colors', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 10);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
    expect(contrastRatio(hex('#777777'), hex('#777777'))).toBe(1);
  });

  it('does not depend on the order of the colors', () => {
    expect(contrastRatio(WHITE, hex('#767676'))).toBe(contrastRatio(hex('#767676'), WHITE));
  });

  it('matches reference ratios against white', () => {
    expect(contrastRatio(hex('#767676'), WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex('#777777'), WHITE)).toBeCloseTo(4.48, 2);
    expect(contrastRatio(hex('#949494'), WHITE)).toBeCloseTo(3.03, 2);
    expect(contrastRatio(hex('#595959'), WHITE)).toBeCloseTo(7, 1);
    expect(contrastRatio(hex('#FF0000'), WHITE)).toBeCloseTo(4, 2);
  });
});

describe('checkContrast', () => {
  it('uses the WCAG 2 thresholds', () => {
    expect(WCAG_THRESHOLDS).toEqual({ aa: { normal: 4.5, large: 3 }, aaa: { normal: 7, large: 4.5 } });
  });

  it('rates black on white as AAA', () => {
    const result = checkContrast(BLACK, WHITE);
    expect(result.ratio).toBeCloseTo(21, 10);
    expect(result.rating).toBe('aaa');
    expect(result.passes).toEqual({ aa: { normal: true, large: true }, aaa: { normal: true, large: true } });
  });

  it('passes #767676 on white for AA normal text (4.54:1)', () => {
    const result = checkContrast(hex('#767676'), WHITE);
    expect(result.rating).toBe('aa');
    expect(result.passes).toEqual({ aa: { normal: true, large: true }, aaa: { normal: false, large: true } });
  });

  it('fails #777777 on white for AA normal text but passes large text (4.48:1)', () => {
    const result = checkContrast(hex('#777777'), WHITE);
    expect(result.rating).toBe('aaLarge');
    expect(result.passes).toEqual({ aa: { normal: false, large: true }, aaa: { normal: false, large: false } });
  });

  it('applies the 3:1 large-text boundary', () => {
    expect(checkContrast(hex('#949494'), WHITE).passes.aa.large).toBe(true);
    expect(checkContrast(hex('#959595'), WHITE).passes.aa.large).toBe(false);
    expect(checkContrast(hex('#959595'), WHITE).rating).toBe('fail');
  });

  it('applies the 7:1 AAA boundary', () => {
    expect(checkContrast(hex('#595959'), WHITE).rating).toBe('aaa');
    expect(checkContrast(hex('#5A5A5A'), WHITE).rating).toBe('aa');
  });

  it('fails identical colors everywhere', () => {
    const result = checkContrast(WHITE, WHITE);
    expect(result.rating).toBe('fail');
    expect(result.passes).toEqual({ aa: { normal: false, large: false }, aaa: { normal: false, large: false } });
  });
});

describe('truncateRatio', () => {
  it('never rounds a failing ratio up to a passing one', () => {
    expect(truncateRatio(4.4999)).toBe(4.49);
    expect(truncateRatio(contrastRatio(hex('#777777'), WHITE))).toBe(4.47);
    expect(truncateRatio(contrastRatio(hex('#767676'), WHITE))).toBe(4.54);
  });

  it('keeps values that already have two decimals', () => {
    expect(truncateRatio(21)).toBe(21);
    expect(truncateRatio(1)).toBe(1);
    expect(truncateRatio(4.54)).toBe(4.54);
    expect(truncateRatio(contrastRatio(BLACK, WHITE))).toBe(21);
  });
});

describe('parseOpaqueHex', () => {
  it('accepts 3- and 6-digit hex, with or without #', () => {
    expect(parseOpaqueHex('#fff')).toEqual(WHITE);
    expect(parseOpaqueHex('000000')).toEqual(BLACK);
  });

  it('accepts fully opaque 8-digit hex', () => {
    expect(parseOpaqueHex('#FFFFFFFF')).toEqual(WHITE);
  });

  it('rejects translucent and invalid values', () => {
    for (const value of ['#FFFFFF80', '#FFF8', 'white', '#12345', '']) {
      expect(parseOpaqueHex(value), value).toBeNull();
    }
  });
});

describe('suggestForegrounds', () => {
  it('suggests dark text on white and light text on black', () => {
    expect(suggestForegrounds(WHITE)).toEqual(['#000000', '#1A1A1A', '#2A2A2A', '#3A3A3A']);
    expect(suggestForegrounds(BLACK)).toEqual(['#FFFFFF', '#F0F0F0', '#E0E0E0', '#D0D0D0']);
  });

  it('suggests dark text on mid-tone backgrounds where white would fail', () => {
    const background = hex('#949494');
    expect(contrastRatio(WHITE, background)).toBeLessThan(4.5);
    expect(suggestForegrounds(background)).toContain('#000000');
    expect(suggestForegrounds(background)).not.toContain('#FFFFFF');
  });

  it('only suggests colors that pass AA for normal text, and always at least one', () => {
    const grays = Array.from({ length: 52 }, (_, index) => ({ r: index * 5, g: index * 5, b: index * 5 }));
    const colors = ['#FF0000', '#00FF00', '#0000FF', '#3B82F6', '#FFA500', '#800080'].map(hex);

    for (const background of [...grays, ...colors]) {
      const suggestions = suggestForegrounds(background);
      expect(suggestions.length).toBeGreaterThan(0);
      for (const suggestion of suggestions) {
        expect(contrastRatio(hex(suggestion), background)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
