import { describe, expect, it } from 'vitest';
import { readItemChanges } from './task-input';

describe('readItemChanges', () => {
  it('reads only the fields that were sent', () => {
    expect(readItemChanges({ completed: true })).toEqual({ completed: true });
    expect(readItemChanges({})).toEqual({});
  });

  it('trims the title, keeps the description and clears an empty one', () => {
    expect(readItemChanges({ title: '  Ship it ', description: 'Notes' })).toEqual({ title: 'Ship it', description: 'Notes' });
    expect(readItemChanges({ description: '   ' })).toEqual({ description: null });
    expect(readItemChanges({ description: null })).toEqual({ description: null });
  });

  it('reads a deadline as a day, and null clears it', () => {
    expect(readItemChanges({ deadline: '2026-10-27' })).toEqual({ deadline: new Date('2026-10-27T00:00:00.000Z') });
    expect(readItemChanges({ deadline: null })).toEqual({ deadline: null });
  });

  it('flags a missing title apart from other bad values', () => {
    expect(readItemChanges({ title: '  ' })).toBe('title');
    expect(readItemChanges({ priority: 'SOON' })).toBe('invalid');
    expect(readItemChanges({ deadline: 'tomorrow' })).toBe('invalid');
    expect(readItemChanges({ completed: 'yes' })).toBe('invalid');
    expect(readItemChanges({ position: -1 })).toBe('invalid');
  });
});
