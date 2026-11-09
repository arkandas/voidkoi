import { afterEach, describe, expect, it } from 'vitest';
import { deadlineDay, formatDeadline, isOverdue } from './deadline';

const systemZone = process.env.TZ;

afterEach(() => {
  process.env.TZ = systemZone;
});

describe('formatDeadline', () => {
  it('shows the day that was picked, in any time zone', () => {
    for (const zone of ['America/Los_Angeles', 'Europe/Madrid', 'Pacific/Auckland']) {
      process.env.TZ = zone;
      expect(formatDeadline('2026-09-25T00:00:00.000Z')).toBe(new Date(2026, 8, 25).toLocaleDateString());
    }
  });

  it('writes the date the way the chosen language does', () => {
    process.env.TZ = 'America/Los_Angeles';
    expect(formatDeadline('2026-09-25T00:00:00.000Z', 'en')).toBe('9/25/2026');
    expect(formatDeadline('2026-09-25T00:00:00.000Z', 'es')).toBe('25/9/2026');
  });
});

describe('isOverdue', () => {
  it('is not overdue at any time on the day it is due', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(isOverdue('2026-09-25T00:00:00.000Z', new Date(2026, 8, 25, 0, 30))).toBe(false);
    expect(isOverdue('2026-09-25T00:00:00.000Z', new Date(2026, 8, 25, 23, 59))).toBe(false);
  });

  it('is overdue from the next day on', () => {
    process.env.TZ = 'Europe/Madrid';
    expect(isOverdue('2026-09-25T00:00:00.000Z', new Date(2026, 8, 26, 0, 1))).toBe(true);
  });

  it('is not overdue the evening before, west of UTC', () => {
    process.env.TZ = 'America/New_York';
    expect(isOverdue('2026-09-25T00:00:00.000Z', new Date(2026, 8, 24, 21, 0))).toBe(false);
  });

  it('reads a bare date the same way', () => {
    expect(isOverdue('2026-09-25', new Date(2026, 8, 25, 12, 0))).toBe(false);
    expect(isOverdue('2026-09-25', new Date(2026, 8, 26, 12, 0))).toBe(true);
  });
});

describe('deadlineDay', () => {
  it('is the day it is due, for the date field', () => {
    expect(deadlineDay('2026-09-25T00:00:00.000Z')).toBe('2026-09-25');
    expect(deadlineDay(null)).toBeNull();
  });
});
