import { describe, expect, it } from 'vitest';
import { ownValue } from '@/modules/utilikit/lib/validate';

describe('ownValue', () => {
  const map: Record<string, number> = { mp3: 1, flac: 2 };

  it('returns own entries', () => {
    expect(ownValue(map, 'mp3')).toBe(1);
  });

  it('ignores inherited keys and non-string keys', () => {
    for (const key of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'wav', 1, null, undefined]) {
      expect(ownValue(map, key)).toBeUndefined();
    }
  });
});
