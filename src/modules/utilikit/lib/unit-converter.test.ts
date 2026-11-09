import { describe, expect, it } from 'vitest';
import {
  convert,
  convertToAll,
  formatNumber,
  getUnits,
  parseDecimal,
  UNIT_CATEGORIES,
} from '@/modules/utilikit/lib/unit-converter';

function expectClose(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-12 * Math.max(1, Math.abs(expected)));
}

describe('convert: temperature', () => {
  it('maps the freezing point of water to 32 °F and 273.15 K', () => {
    expect(convert(0, 'temperature', 'c', 'f')).toBe(32);
    expect(convert(0, 'temperature', 'c', 'k')).toBe(273.15);
    expect(convert(32, 'temperature', 'f', 'c')).toBe(0);
    expect(convert(32, 'temperature', 'f', 'k')).toBe(273.15);
    expect(convert(273.15, 'temperature', 'k', 'c')).toBe(0);
    expect(convert(273.15, 'temperature', 'k', 'f')).toBe(32);
  });

  it('maps the boiling point of water to 212 °F', () => {
    expect(convert(100, 'temperature', 'c', 'f')).toBe(212);
    expect(convert(212, 'temperature', 'f', 'c')).toBe(100);
    expectClose(convert(100, 'temperature', 'c', 'k'), 373.15);
  });

  it('meets at −40 in Celsius and Fahrenheit', () => {
    expect(convert(-40, 'temperature', 'c', 'f')).toBe(-40);
    expect(convert(-40, 'temperature', 'f', 'c')).toBe(-40);
  });

  it('places absolute zero at −273.15 °C and −459.67 °F', () => {
    expect(convert(0, 'temperature', 'k', 'c')).toBe(-273.15);
    expectClose(convert(0, 'temperature', 'k', 'f'), -459.67);
  });
});

describe('convert: linear units', () => {
  it('uses the international mile, inch and foot', () => {
    expectClose(convert(1, 'length', 'mi', 'km'), 1.609344);
    expectClose(convert(1, 'length', 'in', 'cm'), 2.54);
    expectClose(convert(1, 'length', 'ft', 'in'), 12);
    expectClose(convert(1, 'length', 'mi', 'ft'), 5280);
    expectClose(convert(1, 'length', 'km', 'm'), 1000);
  });

  it('uses the international avoirdupois pound and ounce', () => {
    expectClose(convert(1, 'weight', 'lb', 'kg'), 0.45359237);
    expectClose(convert(1, 'weight', 'lb', 'oz'), 16);
    expectClose(convert(1, 'weight', 'kg', 'lb'), 1 / 0.45359237);
    expectClose(convert(1, 'weight', 'oz', 'g'), 28.349523125);
  });

  it('uses the US liquid gallon (231 cubic inches), not the imperial gallon', () => {
    const cubicInchInLiters = convert(1, 'length', 'in', 'cm') ** 3 / 1000;
    expectClose(convert(1, 'volume', 'gal', 'l'), 3.785411784);
    expectClose(convert(1, 'volume', 'gal', 'l'), 231 * cubicInchInLiters);
    expect(Math.abs(convert(1, 'volume', 'gal', 'l') - 4.54609)).toBeGreaterThan(0.7);
  });

  it('uses the US customary cup, a sixteenth of a US gallon', () => {
    expectClose(convert(1, 'volume', 'gal', 'cup'), 16);
    expectClose(convert(1, 'volume', 'cup', 'ml'), 236.5882365);
    expectClose(convert(1, 'volume', 'l', 'ml'), 1000);
  });

  it('returns the value unchanged when both units are the same', () => {
    expect(convert(0.1, 'length', 'ft', 'ft')).toBe(0.1);
    expect(convert(-12.5, 'temperature', 'k', 'k')).toBe(-12.5);
  });
});

describe('convert: round trips and edge values', () => {
  const samples = [0, 1, -1, 0.001, 123.456, -273.15, 1e12];

  for (const category of UNIT_CATEGORIES) {
    it(`returns to the starting value for every ${category} unit pair`, () => {
      for (const from of getUnits(category)) {
        for (const to of getUnits(category)) {
          for (const value of samples) {
            const there = convert(value, category, from, to);
            expect(Number.isFinite(there)).toBe(true);
            const back = convert(there, category, to, from);
            expect(Math.abs(back - value)).toBeLessThanOrEqual(1e-9 * Math.max(1, Math.abs(value)));
          }
        }
      }
    });
  }

  it('keeps zero and negative values', () => {
    expect(convert(0, 'length', 'km', 'mi')).toBe(0);
    expectClose(convert(-5, 'length', 'km', 'm'), -5000);
    expectClose(convert(-2, 'weight', 'kg', 'g'), -2000);
  });

  it('handles huge values and overflows to Infinity past the double range', () => {
    expectClose(convert(1e300, 'length', 'km', 'cm'), 1e305);
    expect(convert(1e308, 'length', 'km', 'cm')).toBe(Infinity);
  });

  it('returns NaN for unknown or cross-category unit ids', () => {
    expect(convert(1, 'length', 'parsec', 'm')).toBeNaN();
    expect(convert(1, 'length', 'm', 'parsec')).toBeNaN();
    expect(convert(1, 'length', 'm', 'kg')).toBeNaN();
    expect(convert(1, 'temperature', 'x', 'c')).toBeNaN();
    expect(convert(1, 'temperature', 'c', 'm')).toBeNaN();
  });

  it('propagates NaN input', () => {
    expect(convert(NaN, 'length', 'm', 'cm')).toBeNaN();
    expect(convert(NaN, 'temperature', 'c', 'f')).toBeNaN();
  });
});

describe('convertToAll', () => {
  it('converts to every other unit of the category', () => {
    const results = convertToAll(1, 'length', 'm');
    expect(Object.keys(results).sort()).toEqual(['cm', 'ft', 'in', 'km', 'mi']);
    expectClose(results.cm ?? NaN, 100);
    expectClose(results.km ?? NaN, 0.001);
    expectClose(results.ft ?? NaN, 1 / 0.3048);
  });

  it('agrees with convert for temperatures', () => {
    expect(convertToAll(0, 'temperature', 'c')).toEqual({ f: 32, k: 273.15 });
  });

  it('returns nothing for unknown units or non-finite values', () => {
    expect(convertToAll(1, 'weight', 'stone')).toEqual({});
    expect(convertToAll(1, 'weight', 'm')).toEqual({});
    expect(convertToAll(1, 'temperature', 'r')).toEqual({});
    expect(convertToAll(NaN, 'length', 'm')).toEqual({});
    expect(convertToAll(Infinity, 'length', 'm')).toEqual({});
  });
});

describe('parseDecimal', () => {
  it('parses plain, signed, fractional and exponent notation in English', () => {
    expect(parseDecimal('1.5', 'en')).toBe(1.5);
    expect(parseDecimal('  -40 ', 'en')).toBe(-40);
    expect(parseDecimal('+3', 'en')).toBe(3);
    expect(parseDecimal('.5', 'en')).toBe(0.5);
    expect(parseDecimal('5.', 'en')).toBe(5);
    expect(parseDecimal('1e3', 'en')).toBe(1000);
    expect(parseDecimal('2.5E-3', 'en')).toBe(0.0025);
    expect(parseDecimal('−40', 'en')).toBe(-40);
  });

  it('accepts a comma or a dot as the decimal separator in Spanish', () => {
    expect(parseDecimal('1,5', 'es')).toBe(1.5);
    expect(parseDecimal('-0,25', 'es')).toBe(-0.25);
    expect(parseDecimal('1.5', 'es')).toBe(1.5);
    expect(parseDecimal(',5', 'es')).toBe(0.5);
  });

  it('rejects a comma decimal separator in English instead of misreading it', () => {
    expect(parseDecimal('1,5', 'en')).toBeNaN();
    expect(parseDecimal('1,500', 'en')).toBeNaN();
  });

  it('rejects grouping separators, stray text and non-finite values', () => {
    expect(parseDecimal('1.000,5', 'es')).toBeNaN();
    expect(parseDecimal('1,5,3', 'es')).toBeNaN();
    expect(parseDecimal('', 'en')).toBeNaN();
    expect(parseDecimal('   ', 'en')).toBeNaN();
    expect(parseDecimal('abc', 'en')).toBeNaN();
    expect(parseDecimal('12abc', 'en')).toBeNaN();
    expect(parseDecimal('1-2', 'en')).toBeNaN();
    expect(parseDecimal('.', 'en')).toBeNaN();
    expect(parseDecimal('Infinity', 'en')).toBeNaN();
    expect(parseDecimal('NaN', 'en')).toBeNaN();
    expect(parseDecimal('1e400', 'en')).toBeNaN();
  });
});

describe('formatNumber', () => {
  it('uses the locale decimal and grouping separators', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'es')).toBe('1234,5');
    expect(formatNumber(12345.5, 'es')).toBe('12.345,5');
    expect(formatNumber(-40, 'es')).toBe('-40');
  });

  it('rounds to the requested number of fraction digits', () => {
    expect(formatNumber(1 / 3, 'en')).toBe('0.333333');
    expect(formatNumber(1 / 3, 'en', 2)).toBe('0.33');
    expect(formatNumber(273.15, 'es', 4)).toBe('273,15');
  });

  it('never shows a negative zero', () => {
    expect(formatNumber(-0, 'en')).toBe('0');
    expect(formatNumber(-1e-9, 'en')).toBe('0');
  });

  it('switches to scientific notation for huge values', () => {
    expect(formatNumber(1e25, 'en')).toBe('1E25');
    expect(formatNumber(1.5e300, 'es')).toBe('1,5E300');
    expect(formatNumber(1e20, 'en')).toBe('100,000,000,000,000,000,000');
  });
});
