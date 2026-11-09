import { describe, expect, it } from 'vitest';
import { formatPercentChange } from '@/modules/utilikit/lib/format';

describe('formatPercentChange', () => {
  it('reports the size reduction', () => {
    expect(formatPercentChange(1000, 250)).toBe(75);
    expect(formatPercentChange(1000, 1000)).toBe(0);
  });

  it('is negative when the output grew', () => {
    expect(formatPercentChange(1000, 1500)).toBe(-50);
  });

  it('handles an empty original', () => {
    expect(formatPercentChange(0, 100)).toBe(0);
  });
});
