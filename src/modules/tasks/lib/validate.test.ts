import { describe, expect, it } from 'vitest';
import {
  isPriority,
  isStickyColor,
  isValidOptionalText,
  moveItem,
  optionalText,
  parseIndex,
  parseOptionalDate,
} from './validate';

describe('parseIndex', () => {
  it('accepts zero and positive integers', () => {
    expect(parseIndex(0)).toBe(0);
    expect(parseIndex('3')).toBe(3);
  });

  it('rejects negatives, fractions and junk', () => {
    for (const value of [-1, '1.5', 'x', null, undefined]) {
      expect(parseIndex(value)).toBeNull();
    }
  });
});

describe('optionalText', () => {
  it('keeps undefined apart from null so a field can be left alone or cleared', () => {
    expect(optionalText(undefined, 10)).toBeUndefined();
    expect(optionalText(null, 10)).toBeNull();
  });

  it('turns blank text into null and keeps real text as written', () => {
    expect(optionalText('  ', 10)).toBeNull();
    expect(optionalText(' kept ', 10)).toBe(' kept ');
  });

  it('agrees with isValidOptionalText about the limit', () => {
    expect(isValidOptionalText('x'.repeat(10), 10)).toBe(true);
    expect(isValidOptionalText('x'.repeat(11), 10)).toBe(false);
    expect(isValidOptionalText(5, 10)).toBe(false);
    expect(isValidOptionalText(null, 10)).toBe(true);
  });
});

describe('enum guards', () => {
  it('accept the known values only', () => {
    expect(isPriority('URGENT')).toBe(true);
    expect(isPriority('urgent')).toBe(false);
    expect(isStickyColor('lime')).toBe(true);
    expect(isStickyColor('gold')).toBe(false);
  });
});

describe('parseOptionalDate', () => {
  it('parses a date, clears on null or empty, and leaves undefined alone', () => {
    expect(parseOptionalDate('2026-09-21')).toEqual(new Date('2026-09-21'));
    expect(parseOptionalDate(null)).toBeNull();
    expect(parseOptionalDate('')).toBeNull();
    expect(parseOptionalDate(undefined)).toBeUndefined();
  });

  it('flags values that are not dates', () => {
    expect(parseOptionalDate('soon')).toBe('invalid');
    expect(parseOptionalDate(20260921)).toBe('invalid');
  });
});

describe('moveItem', () => {
  it('moves an item and leaves the input untouched', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(moveItem(items, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(items, 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(items).toEqual(['a', 'b', 'c', 'd']);
  });

  it('clamps a target past either end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 99)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 2, -5)).toEqual(['c', 'a', 'b']);
  });
});
