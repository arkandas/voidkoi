import { describe, expect, it } from 'vitest';
import {
  buildCronExpression,
  CRON_PRESETS,
  CronParts,
  describeCron,
  getNextRuns,
  normalizeCronExpression,
  parseCronExpression,
  validateCronExpression,
} from '@/modules/utilikit/lib/cron-utils';

const toIso = (dates: Date[]) => dates.map(date => date.toISOString());

describe('validateCronExpression', () => {
  it.each([
    '* * * * *',
    '*/5 * * * *',
    '0,15,30,45 * * * *',
    '0 9-17 * * 1-5',
    '30 4 1,15 * *',
    '*/10 */2 * * *',
    '0 0 1 1 *',
    '0 0 * * 0',
    '0 0 * * 7',
    '59 23 31 12 *',
    '  0   12  * * *  ',
  ])('accepts %j', expression => {
    expect(validateCronExpression(expression)).toEqual({ valid: true });
  });

  it('rejects an empty expression', () => {
    expect(validateCronExpression('')).toEqual({ valid: false, error: 'empty' });
    expect(validateCronExpression('   ')).toEqual({ valid: false, error: 'empty' });
  });

  it.each(['*', '* * * *', '0 0 * * * *', '0 0 0 * * * *'])('rejects %j because of its field count', expression => {
    expect(validateCronExpression(expression)).toEqual({ valid: false, error: 'fieldCount' });
  });

  it.each([
    ['60 * * * *', 'minute'],
    ['*/0 * * * *', 'minute'],
    ['abc * * * *', 'minute'],
    ['0 24 * * *', 'hour'],
    ['0 5-2 * * *', 'hour'],
    ['0 0 0 * *', 'dayOfMonth'],
    ['0 0 32 * *', 'dayOfMonth'],
    ['0 0 * 0 *', 'month'],
    ['0 0 * 13 *', 'month'],
    ['0 0 * * 8', 'dayOfWeek'],
    ['0 0 * * 1-8', 'dayOfWeek'],
  ])('rejects %j and points at the %s field', (expression, field) => {
    expect(validateCronExpression(expression)).toEqual({ valid: false, error: 'invalidField', field });
  });

  it('reports the first invalid field', () => {
    expect(validateCronExpression('99 99 * * *')).toEqual({ valid: false, error: 'invalidField', field: 'minute' });
  });
});

describe('parseCronExpression and buildCronExpression', () => {
  it('splits an expression into named fields', () => {
    expect(parseCronExpression('*/15 9-17 1,15 * 1-5')).toEqual({
      minute: '*/15',
      hour: '9-17',
      dayOfMonth: '1,15',
      month: '*',
      dayOfWeek: '1-5',
    });
  });

  it('round-trips every preset', () => {
    for (const { expression } of CRON_PRESETS) {
      expect(buildCronExpression(parseCronExpression(expression))).toBe(expression);
    }
  });

  it('keeps an empty field in its position', () => {
    const parts: CronParts = { minute: '0', hour: '', dayOfMonth: '*', month: '*', dayOfWeek: '1-5' };
    const expression = buildCronExpression(parts);
    expect(parseCronExpression(expression)).toEqual(parts);
    expect(validateCronExpression(expression)).toEqual({ valid: false, error: 'fieldCount' });
  });

  it('tolerates irregular whitespace and pads missing fields', () => {
    expect(parseCronExpression('  0\t12  * * * ')).toEqual({
      minute: '0',
      hour: '12',
      dayOfMonth: '*',
      month: '*',
      dayOfWeek: '*',
    });
    expect(parseCronExpression('0 12')).toEqual({ minute: '0', hour: '12', dayOfMonth: '', month: '', dayOfWeek: '' });
  });

  it('normalizes whitespace', () => {
    expect(normalizeCronExpression('  0\t12  * *   * ')).toBe('0 12 * * *');
  });
});

describe('getNextRuns', () => {
  const from = new Date('2026-01-01T00:07:00Z');

  it('lists the next quarter hours after a fixed date', () => {
    expect(toIso(getNextRuns('*/15 * * * *', 4, from, 'UTC'))).toEqual([
      '2026-01-01T00:15:00.000Z',
      '2026-01-01T00:30:00.000Z',
      '2026-01-01T00:45:00.000Z',
      '2026-01-01T01:00:00.000Z',
    ]);
  });

  it('starts strictly after the given date', () => {
    expect(toIso(getNextRuns('0 * * * *', 2, new Date('2026-01-01T01:00:00Z'), 'UTC'))).toEqual([
      '2026-01-01T02:00:00.000Z',
      '2026-01-01T03:00:00.000Z',
    ]);
  });

  it('treats day-of-week 0 and 7 as Sunday', () => {
    const sundays = ['2026-01-04T00:00:00.000Z', '2026-01-11T00:00:00.000Z', '2026-01-18T00:00:00.000Z'];
    expect(sundays.map(date => new Date(date).getUTCDay())).toEqual([0, 0, 0]);
    expect(toIso(getNextRuns('0 0 * * 0', 3, from, 'UTC'))).toEqual(sundays);
    expect(toIso(getNextRuns('0 0 * * 7', 3, from, 'UTC'))).toEqual(sundays);
  });

  it('runs when either day field matches, like standard cron', () => {
    expect(toIso(getNextRuns('0 0 1 * 1', 5, from, 'UTC'))).toEqual([
      '2026-01-05T00:00:00.000Z',
      '2026-01-12T00:00:00.000Z',
      '2026-01-19T00:00:00.000Z',
      '2026-01-26T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    ]);
  });

  it('evaluates the expression in the given time zone', () => {
    expect(toIso(getNextRuns('0 9 * * *', 2, from, 'America/New_York'))).toEqual([
      '2026-01-01T14:00:00.000Z',
      '2026-01-02T14:00:00.000Z',
    ]);
  });

  it('returns nothing for invalid expressions or dates that never occur', () => {
    expect(getNextRuns('61 * * * *', 3, from, 'UTC')).toEqual([]);
    expect(getNextRuns('* * * *', 3, from, 'UTC')).toEqual([]);
    expect(getNextRuns('0 0 30 2 *', 3, from, 'UTC')).toEqual([]);
  });
});

describe('describeCron', () => {
  it('describes expressions in English', () => {
    expect(describeCron('*/15 * * * *', 'en')).toBe('Every 15 minutes');
    const weekdays = describeCron('0 9 * * 1-5', 'en');
    expect(weekdays).toContain('09:00');
    expect(weekdays).toContain('Monday through Friday');
  });

  it('describes expressions in Spanish', () => {
    expect(describeCron('*/15 * * * *', 'es')).toBe('Cada 15 minutos');
    const weekdays = describeCron('0 9 * * 1-5', 'es');
    expect(weekdays).toContain('09:00');
    expect(weekdays).toContain('lunes a viernes');
  });

  it('uses the 24-hour clock', () => {
    const description = describeCron('30 18 * * *', 'en');
    expect(description).toContain('18:30');
    expect(description).not.toMatch(/PM/);
  });

  it('describes day-of-week 7 as Sunday', () => {
    expect(describeCron('0 0 * * 7', 'en')).toContain('Sunday');
    expect(describeCron('0 0 * * 7', 'es')).toContain('domingo');
  });

  it('returns null for invalid expressions', () => {
    expect(describeCron('* * * *', 'en')).toBeNull();
    expect(describeCron('0 0 32 * *', 'es')).toBeNull();
  });
});

describe('CRON_PRESETS', () => {
  it('only contains valid expressions with unique ids', () => {
    for (const { expression } of CRON_PRESETS) {
      expect(validateCronExpression(expression)).toEqual({ valid: true });
    }
    expect(new Set(CRON_PRESETS.map(preset => preset.id)).size).toBe(CRON_PRESETS.length);
    expect(new Set(CRON_PRESETS.map(preset => preset.expression)).size).toBe(CRON_PRESETS.length);
  });
});
