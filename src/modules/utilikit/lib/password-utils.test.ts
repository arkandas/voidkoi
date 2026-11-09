import { afterEach, describe, expect, it, vi } from 'vitest';
import { EFF_LONG_WORDLIST } from '@/modules/utilikit/lib/eff-wordlist';
import {
  calculateEntropy,
  clampBatchSize,
  clampWordCount,
  GeneratedPassword,
  generateMultiplePasswords,
  generatePassphrase,
  generatePassword,
  getCharacterPools,
  rateStrength,
  STRENGTH_LEVELS,
} from '@/modules/utilikit/lib/password-utils';
import { PasswordOptions } from '@/modules/utilikit/lib/types';

const NONE: PasswordOptions = {
  length: 16,
  uppercase: false,
  lowercase: false,
  numbers: false,
  symbols: false,
  excludeAmbiguous: false,
};
const ALL: PasswordOptions = { ...NONE, uppercase: true, lowercase: true, numbers: true, symbols: true };

const CLASS_PATTERNS = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/];
const BITS_PER_EFF_WORD = 5 * Math.log2(6);

function create(options: PasswordOptions): GeneratedPassword {
  const result = generatePassword(options);
  if (!result) throw new Error('expected a password');
  return result;
}

function sample(options: PasswordOptions, count = 200): string[] {
  return Array.from({ length: count }, () => create(options).password);
}

function wordsOf(wordCount: number): string[] {
  return generatePassphrase(wordCount, ' ').password.split(' ');
}

function stubRandomValues(values: number[]) {
  const queue = [...values];
  return vi.spyOn(crypto, 'getRandomValues').mockImplementation(<T,>(array: T): T => {
    if (array instanceof Uint32Array) {
      for (let index = 0; index < array.length; index++) array[index] = queue.shift() ?? 0;
    }
    return array;
  });
}

function bruteForceEntropy(length: number, poolSizes: number[]): number {
  const poolOf = poolSizes.flatMap((size, pool) => Array<number>(size).fill(pool));
  let valid = 0;
  for (let n = 0; n < poolOf.length ** length; n++) {
    const seen = new Set<number>();
    for (let position = 0, rest = n; position < length; position++, rest = Math.floor(rest / poolOf.length)) {
      seen.add(poolOf[rest % poolOf.length]);
    }
    if (seen.size === poolSizes.length) valid++;
  }
  return Math.log2(valid);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('generatePassword', () => {
  it('honours the requested length', () => {
    for (const length of [4, 8, 12, 16, 64, 128]) {
      expect(create({ ...ALL, length }).password).toHaveLength(length);
    }
  });

  it('includes every enabled class, even when the length leaves no slack', () => {
    for (const length of [4, 8]) {
      for (const password of sample({ ...ALL, length })) {
        for (const pattern of CLASS_PATTERNS) expect(password).toMatch(pattern);
      }
    }
  });

  it('never uses a disabled class', () => {
    expect(sample({ ...NONE, lowercase: true, numbers: true }).join('')).toMatch(/^[a-z0-9]+$/);
    expect(sample({ ...NONE, uppercase: true }).join('')).toMatch(/^[A-Z]+$/);
    expect(sample({ ...NONE, symbols: true }).join('')).toMatch(/^[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]+$/);
  });

  it('leaves out look-alike characters only when asked to', () => {
    const excluded = sample({ ...ALL, length: 64, excludeAmbiguous: true }).join('');
    const included = sample({ ...ALL, length: 64 }).join('');
    for (const char of '0O1lI|') {
      expect(excluded).not.toContain(char);
      expect(included).toContain(char);
    }
  });

  it('returns null instead of looping when no password can satisfy the options', () => {
    expect(generatePassword(NONE)).toBeNull();
    expect(generatePassword({ ...NONE, excludeAmbiguous: true })).toBeNull();
    expect(generatePassword({ ...ALL, length: 3 })).toBeNull();
    expect(generatePassword({ ...ALL, length: 12.5 })).toBeNull();
    expect(generatePassword({ ...ALL, length: Number.NaN })).toBeNull();
    expect(generateMultiplePasswords(5, NONE)).toEqual([]);
  });

  it('reports the entropy of the pools it drew from', () => {
    expect(create({ ...ALL, length: 20 }).entropy).toBeCloseTo(calculateEntropy(20, [26, 26, 10, 26]), 10);
    expect(create({ ...ALL, length: 20, excludeAmbiguous: true }).entropy).toBeCloseTo(
      calculateEntropy(20, [23, 23, 8, 25]),
      10
    );
  });
});

describe('randomness', () => {
  it('comes from crypto.getRandomValues, never Math.random', () => {
    const mathRandom = vi.spyOn(Math, 'random');
    const getRandomValues = vi.spyOn(crypto, 'getRandomValues');
    generatePassword(ALL);
    generatePassphrase();
    expect(mathRandom).not.toHaveBeenCalled();
    expect(getRandomValues).toHaveBeenCalled();
  });

  it('rejects values from the biased tail instead of reducing them modulo the charset size', () => {
    stubRandomValues([2 ** 32 - 1, 7]);
    expect(create({ ...NONE, numbers: true, length: 1 }).password).toBe('7');
  });

  it('rejects values from the biased tail when picking passphrase words', () => {
    stubRandomValues([2 ** 32 - 1, 1, 2, 3, 4]);
    expect(generatePassphrase(4, ' ').password).toBe(EFF_LONG_WORDLIST.slice(1, 5).join(' '));
  });
});

describe('getCharacterPools', () => {
  it('uses the full ASCII classes by default', () => {
    expect(getCharacterPools(ALL).map(pool => pool.length)).toEqual([26, 26, 10, 26]);
  });

  it('removes O/I/L, o/i/l, 0/1 and | when excluding ambiguous characters', () => {
    const pools = getCharacterPools({ ...ALL, excludeAmbiguous: true });
    expect(pools.map(pool => pool.length)).toEqual([23, 23, 8, 25]);
    expect(pools.join('')).not.toMatch(/[0O1lI|]/);
  });
});

describe('calculateEntropy', () => {
  it('is length × log2(alphabet size) for a single pool', () => {
    expect(calculateEntropy(12, [62])).toBeCloseTo(71.45, 2);
    expect(calculateEntropy(16, [88])).toBeCloseTo(103.35, 2);
    expect(calculateEntropy(128, [26])).toBeCloseTo(601.66, 2);
  });

  it('counts only the strings that contain every required class', () => {
    expect(calculateEntropy(3, [2, 3])).toBeCloseTo(Math.log2(5 ** 3 - 3 ** 3 - 2 ** 3), 10);
    for (const [length, poolSizes] of [
      [3, [2, 3]],
      [4, [1, 1, 2]],
      [5, [3, 2, 2, 1]],
      [6, [4, 1]],
    ] as const) {
      expect(calculateEntropy(length, poolSizes)).toBeCloseTo(bruteForceEntropy(length, [...poolSizes]), 10);
    }
  });

  it('is slightly below 71.45 bits for 12 alphanumeric characters that must mix all three classes', () => {
    const valid = 62 ** 12 - 52 ** 12 - 2 * 36 ** 12 + 2 * 26 ** 12 + 10 ** 12;
    const expected = Math.log2(valid);
    expect(expected).toBeCloseTo(71.26, 2);
    expect(calculateEntropy(12, [26, 26, 10])).toBeCloseTo(expected, 8);
    expect(create({ ...NONE, uppercase: true, lowercase: true, numbers: true, length: 12 }).entropy).toBeCloseTo(
      expected,
      8
    );
  });

  it('is zero when no password is possible', () => {
    expect(calculateEntropy(12, [])).toBe(0);
    expect(calculateEntropy(2, [26, 26, 10])).toBe(0);
  });
});

describe('rateStrength', () => {
  it.each([
    [0, 'weak'],
    [39.99, 'weak'],
    [40, 'fair'],
    [59.99, 'fair'],
    [60, 'good'],
    [79.99, 'good'],
    [80, 'strong'],
    [127.99, 'strong'],
    [128, 'veryStrong'],
    [601.65, 'veryStrong'],
  ] as const)('rates %s bits as %s', (bits, expected) => {
    expect(rateStrength(bits)).toBe(expected);
  });

  it('only returns camelCase levels that double as message keys', () => {
    expect(STRENGTH_LEVELS).toEqual(['weak', 'fair', 'good', 'strong', 'veryStrong']);
  });

  it('rates passwords and passphrases through the same entropy thresholds', () => {
    const results = [
      ...[4, 8, 12, 16, 20, 64].map(length => create({ ...ALL, length })),
      ...[8, 16, 128].map(length => create({ ...NONE, lowercase: true, length })),
      ...[4, 5, 6, 7, 9, 10, 12].map(words => generatePassphrase(words)),
    ];
    for (const { strength, entropy } of results) expect(strength).toBe(rateStrength(entropy));
  });

  it('matches the reference ratings for both modes', () => {
    expect(create({ ...NONE, lowercase: true, length: 128 }).strength).toBe('veryStrong');
    expect(create({ ...ALL, length: 8 }).strength).toBe('fair');
    expect(create({ ...ALL, length: 12 }).strength).toBe('good');
    expect(create({ ...ALL, length: 16 }).strength).toBe('strong');
    expect(create({ ...ALL, length: 20 }).strength).toBe('veryStrong');
    expect(generatePassphrase(4).strength).toBe('fair');
    expect(generatePassphrase(6).strength).toBe('good');
    expect(generatePassphrase(7).strength).toBe('strong');
    expect(generatePassphrase(10).strength).toBe('veryStrong');
  });
});

describe('batches', () => {
  it('generates the requested number of passwords', () => {
    const passwords = generateMultiplePasswords(5, ALL);
    expect(passwords).toHaveLength(5);
    for (const { password } of passwords) expect(password).toHaveLength(16);
  });

  it.each([
    [5, 5],
    [0, 1],
    [-3, 1],
    [3.7, 3],
    [20, 20],
    [21, 20],
    [Number.NaN, 1],
  ])('clamps a batch of %s to %s', (count, expected) => {
    expect(clampBatchSize(count)).toBe(expected);
    expect(generateMultiplePasswords(count, ALL)).toHaveLength(expected);
  });
});

describe('generatePassphrase', () => {
  it('draws from the 7776 distinct words of the EFF long list', () => {
    expect(new Set(EFF_LONG_WORDLIST).size).toBe(7776);
    for (const word of wordsOf(12)) expect(EFF_LONG_WORDLIST).toContain(word);
  });

  it('joins six words with hyphens by default', () => {
    const indices = [10, 200, 3000, 4000, 5000, 7775];
    stubRandomValues(indices);
    expect(generatePassphrase().password).toBe(indices.map(index => EFF_LONG_WORDLIST[index]).join('-'));
  });

  it('honours the word count and separator', () => {
    expect(wordsOf(8)).toHaveLength(8);
    expect(generatePassphrase(5, '.').password.split('.')).toHaveLength(5);
  });

  it.each([
    [2, 4],
    [4, 4],
    [7.9, 7],
    [12, 12],
    [20, 12],
    [Number.NaN, 6],
  ])('clamps a word count of %s to %s', (count, expected) => {
    expect(clampWordCount(count)).toBe(expected);
    expect(wordsOf(count)).toHaveLength(expected);
  });

  it('has log2(7776) ≈ 12.925 bits of entropy per word', () => {
    expect(generatePassphrase(4).entropy).toBeCloseTo(51.7, 2);
    expect(generatePassphrase(6).entropy).toBeCloseTo(77.55, 2);
    for (let words = 4; words <= 12; words++) {
      expect(generatePassphrase(words).entropy).toBeCloseTo(words * BITS_PER_EFF_WORD, 10);
    }
  });
});
