import { describe, expect, it } from 'vitest';

import {
  daysApart,
  formatCallTime,
  formatDayLabel,
  formatDurationWords,
  groupByDay,
  timeFormatFrom,
} from './time';
import spanishTalk from '@/messages/es/talk.json';

const spanish = timeFormatFrom('es', spanishTalk.time);

describe('durations', () => {
  it.each([
    [0, '0 sec'],
    [45, '45 sec'],
    [60, '1 min'],
    [90, '1 min 30 sec'],
    [125, '2 min 5 sec'],
  ])('spells %i seconds as %s', (seconds, expected) => {
    expect(formatDurationWords(seconds)).toBe(expected);
  });

  it.each([
    [0, '0 s'],
    [45, '45 s'],
    [60, '1 min'],
    [125, '2 min 5 s'],
  ])('spells %i seconds as %s in Spanish', (seconds, expected) => {
    expect(spanish.durationWords(seconds)).toBe(expected);
  });
});

describe('day labels', () => {
  const now = new Date('2026-09-09T12:00:00Z');

  it('counts calendar days, not 24 hour blocks', () => {
    // 23:30 to 00:30 is one hour but a different day.
    expect(daysApart(new Date('2026-09-08T23:30:00'), new Date('2026-09-09T00:30:00'))).toBe(1);
  });

  it('names today and yesterday', () => {
    expect(formatDayLabel(new Date('2026-09-09T08:00:00').toISOString(), now)).toBe('Today');
    expect(formatDayLabel(new Date('2026-09-08T08:00:00').toISOString(), now)).toBe('Yesterday');
  });

  it('falls back to a date for anything older than a week', () => {
    const label = formatDayLabel(new Date('2026-08-01T08:00:00').toISOString(), now);
    expect(label).not.toBe('Today');
    expect(label).toMatch(/1/);
  });

  it('names the days in Spanish', () => {
    expect(spanish.dayLabel(new Date('2026-09-09T08:00:00').toISOString(), now)).toBe('Hoy');
    expect(spanish.dayLabel(new Date('2026-09-08T08:00:00').toISOString(), now)).toBe('Ayer');
    // 2026-09-07 is a Monday; a weekday on its own starts with a capital.
    expect(spanish.dayLabel(new Date('2026-09-07T08:00:00').toISOString(), now)).toBe('Lunes');
    expect(spanish.dayLabel(new Date('2026-08-01T08:00:00').toISOString(), now)).toBe('1 de agosto');
    expect(spanish.listTime(new Date('2026-09-08T08:00:00').toISOString(), now)).toBe('Ayer');
  });

  it('puts the time after today and yesterday for calls', () => {
    const today = new Date('2026-09-09T08:05:00');
    const time = spanish.time(today.toISOString());
    expect(time).toBe('08:05');
    expect(spanish.callTime(today.toISOString(), now)).toBe(`Hoy, ${time}`);
    expect(formatCallTime(new Date('2026-09-08T08:05:00').toISOString(), now)).toMatch(
      /^Yesterday, /,
    );
  });
});

describe('grouping', () => {
  it('buckets consecutive items by day and keeps order', () => {
    const items = [
      { id: 1, at: '2026-09-08T10:00:00Z' },
      { id: 2, at: '2026-09-08T18:00:00Z' },
      { id: 3, at: '2026-09-09T09:00:00Z' },
    ];
    const groups = groupByDay(items, (item) => item.at);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.items.map((i) => i.id)).toEqual([1, 2]);
    expect(groups[1]!.items.map((i) => i.id)).toEqual([3]);
  });

  it('handles an empty list', () => {
    expect(groupByDay([], () => '')).toEqual([]);
  });
});
