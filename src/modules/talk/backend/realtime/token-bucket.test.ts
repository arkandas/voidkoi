import { describe, expect, it } from 'vitest';

import { TokenBucket } from './token-bucket';

describe('a token bucket', () => {
  it('allows its whole capacity at once, then nothing', () => {
    const bucket = new TokenBucket(3, 1, 0);
    expect([1, 2, 3, 4].map(() => bucket.take(0))).toEqual([true, true, true, false]);
  });

  it('grows back at its rate, never past its capacity', () => {
    const bucket = new TokenBucket(2, 2, 0);
    bucket.take(0);
    bucket.take(0);
    expect(bucket.take(250)).toBe(false);
    expect(bucket.take(500)).toBe(true);
    expect(bucket.take(500)).toBe(false);
    expect([1, 2, 3].map(() => bucket.take(60_000))).toEqual([true, true, false]);
  });

  it('gains nothing from a clock that goes back', () => {
    const bucket = new TokenBucket(1, 1, 10_000);
    bucket.take(10_000);
    expect(bucket.take(0)).toBe(false);
    expect(bucket.take(500)).toBe(false);
  });
});
