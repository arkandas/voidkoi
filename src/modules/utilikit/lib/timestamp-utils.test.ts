import { describe, expect, it } from 'vitest';
import {
  detectTimestampUnit,
  formatDateTime,
  getTimestampFormats,
  parseDateString,
  parseUnixTimestamp,
} from '@/modules/utilikit/lib/timestamp-utils';

describe('parseUnixTimestamp', () => {
  it('reads the Unix epoch', () => {
    expect(parseUnixTimestamp('0')).toEqual({ ms: 0, unit: 'seconds' });
    expect(getTimestampFormats(0)).toEqual({ seconds: 0, milliseconds: 0, iso: '1970-01-01T00:00:00.000Z' });
  });

  it('reads the largest signed 32-bit timestamp', () => {
    expect(parseUnixTimestamp('2147483647')).toEqual({ ms: Date.UTC(2038, 0, 19, 3, 14, 7), unit: 'seconds' });
    expect(getTimestampFormats(2147483647000).iso).toBe('2038-01-19T03:14:07.000Z');
  });

  it('reads negative timestamps before 1970', () => {
    expect(parseUnixTimestamp('-1')).toEqual({ ms: -1000, unit: 'seconds' });
    expect(parseUnixTimestamp('-86400')).toEqual({ ms: Date.UTC(1969, 11, 31), unit: 'seconds' });
  });

  it('detects milliseconds from the magnitude', () => {
    const instant = Date.UTC(2023, 10, 14, 22, 13, 20);
    expect(parseUnixTimestamp('1700000000')).toEqual({ ms: instant, unit: 'seconds' });
    expect(parseUnixTimestamp('1700000000000')).toEqual({ ms: instant, unit: 'milliseconds' });
    expect(parseUnixTimestamp('-1700000000000')).toEqual({ ms: -instant, unit: 'milliseconds' });
    expect(detectTimestampUnit(99_999_999_999)).toBe('seconds');
    expect(detectTimestampUnit(100_000_000_000)).toBe('milliseconds');
  });

  it('keeps fractional seconds and ignores surrounding whitespace', () => {
    expect(parseUnixTimestamp(' 1700000000.123 ')).toEqual({ ms: 1700000000123, unit: 'seconds' });
  });

  it('accepts the whole range of JavaScript dates', () => {
    expect(parseUnixTimestamp('8640000000000000')).toEqual({ ms: 8.64e15, unit: 'milliseconds' });
    expect(parseUnixTimestamp('-8640000000000000')).toEqual({ ms: -8.64e15, unit: 'milliseconds' });
  });

  it.each(['', '   ', 'abc', '12abc', '1,5', 'Infinity', 'NaN', '1e20', '8640000000000001', '-8640000000000001'])(
    'rejects %j',
    input => {
      expect(parseUnixTimestamp(input)).toBeNull();
    }
  );
});

describe('getTimestampFormats', () => {
  it('floors to whole seconds, also before the epoch', () => {
    expect(getTimestampFormats(1500)).toEqual({ seconds: 1, milliseconds: 1500, iso: '1970-01-01T00:00:01.500Z' });
    expect(getTimestampFormats(-1500)).toEqual({ seconds: -2, milliseconds: -1500, iso: '1969-12-31T23:59:58.500Z' });
  });

  it('uses the extended ISO 8601 year format at the limits', () => {
    expect(getTimestampFormats(8.64e15).iso).toBe('+275760-09-13T00:00:00.000Z');
    expect(getTimestampFormats(-8.64e15).iso).toBe('-271821-04-20T00:00:00.000Z');
  });

  it.each([0, -1000, 2147483647000, 1700000000000, -1700000000000])('round-trips %d through seconds', ms => {
    expect(parseUnixTimestamp(String(getTimestampFormats(ms).seconds))?.ms).toBe(ms);
  });

  it.each([2147483647000, 1700000000123, -1700000000000, 8.64e15])('round-trips %d through milliseconds', ms => {
    expect(parseUnixTimestamp(String(getTimestampFormats(ms).milliseconds))?.ms).toBe(ms);
  });

  it.each([0, -1000, 1500, -1500, 2147483647000, 1700000000123, 8.64e15, -8.64e15])(
    'round-trips %d through ISO 8601',
    ms => {
      expect(parseDateString(getTimestampFormats(ms).iso)).toBe(ms);
    }
  );
});

describe('parseDateString', () => {
  it('reads ISO 8601 strings with an explicit offset', () => {
    expect(parseDateString('2024-01-01T12:00:00Z')).toBe(Date.UTC(2024, 0, 1, 12));
    expect(parseDateString(' 2024-01-01T12:00:00+02:00 ')).toBe(Date.UTC(2024, 0, 1, 10));
  });

  it('treats a date-only ISO string as UTC midnight', () => {
    expect(parseDateString('2024-01-01')).toBe(Date.UTC(2024, 0, 1));
  });

  it.each(['', '  ', 'not a date', '2024-13-45'])('rejects %j', input => {
    expect(parseDateString(input)).toBeNull();
  });
});

describe('formatDateTime', () => {
  it('formats in the requested language', () => {
    const english = formatDateTime(0, 'en', 'UTC');
    expect(english).toContain('Thursday');
    expect(english).toContain('January 1, 1970');
    expect(english).toContain('UTC');

    const spanish = formatDateTime(0, 'es', 'UTC');
    expect(spanish).toContain('jueves');
    expect(spanish).toContain('1 de enero de 1970');
  });

  it('shifts the calendar date with the time zone', () => {
    const instant = Date.UTC(2024, 0, 1, 23, 30);
    expect(formatDateTime(instant, 'en', 'UTC')).toContain('January 1, 2024');
    expect(formatDateTime(instant, 'en', 'Asia/Tokyo')).toContain('January 2, 2024');
  });
});
