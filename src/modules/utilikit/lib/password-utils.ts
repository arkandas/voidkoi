import { EFF_LONG_WORDLIST } from '@/modules/utilikit/lib/eff-wordlist';
import { PasswordOptions } from '@/modules/utilikit/lib/types';

export const CHARACTER_TYPES = ['uppercase', 'lowercase', 'numbers', 'symbols'] as const;
export type CharacterType = (typeof CHARACTER_TYPES)[number];

export const STRENGTH_LEVELS = ['weak', 'fair', 'good', 'strong', 'veryStrong'] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

export interface GeneratedPassword {
  password: string;
  strength: StrengthLevel;
  entropy: number;
}

const CHARACTER_SETS: Record<CharacterType, string> = {
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  numbers: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
};

const AMBIGUOUS_CHARACTERS = '0Oo1lIiL|';

export const MAX_BATCH_SIZE = 20;
export const MIN_PASSPHRASE_WORDS = 4;
export const MAX_PASSPHRASE_WORDS = 12;
export const DEFAULT_PASSPHRASE_WORDS = 6;

export const DEFAULT_PASSWORD_OPTIONS: PasswordOptions = {
  length: 16,
  uppercase: true,
  lowercase: true,
  numbers: true,
  symbols: true,
  excludeAmbiguous: false,
};

const UINT32_RANGE = 2 ** 32;

function randomIndex(size: number): number {
  const limit = UINT32_RANGE - (UINT32_RANGE % size);
  const value = new Uint32Array(1);
  do {
    crypto.getRandomValues(value);
  } while (value[0] >= limit);
  return value[0] % size;
}

function randomString(charset: string, length: number): string {
  return Array.from({ length }, () => charset[randomIndex(charset.length)]).join('');
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function subsets<T>(items: readonly T[]): T[][] {
  return items.reduce<T[][]>((all, item) => [...all, ...all.map(subset => [...subset, item])], [[]]);
}

function clamp(value: number, min: number, max: number, fallback: number): number {
  return Number.isNaN(value) ? fallback : Math.min(max, Math.max(min, Math.trunc(value)));
}

export function getCharacterPools(options: PasswordOptions): string[] {
  return CHARACTER_TYPES.filter(type => options[type])
    .map(type =>
      Array.from(CHARACTER_SETS[type])
        .filter(char => !options.excludeAmbiguous || !AMBIGUOUS_CHARACTERS.includes(char))
        .join('')
    )
    .filter(pool => pool.length > 0);
}

export function calculateEntropy(length: number, poolSizes: readonly number[]): number {
  const total = sum(poolSizes);
  if (total === 0 || length < poolSizes.length) return 0;

  const coverage = subsets(poolSizes).reduce(
    (share, missing) => share + (-1) ** missing.length * ((total - sum(missing)) / total) ** length,
    0
  );

  return length * Math.log2(total) + Math.log2(coverage);
}

export function rateStrength(entropy: number): StrengthLevel {
  if (entropy < 40) return 'weak';
  if (entropy < 60) return 'fair';
  if (entropy < 80) return 'good';
  if (entropy < 128) return 'strong';
  return 'veryStrong';
}

export function generatePassword(options: PasswordOptions): GeneratedPassword | null {
  const pools = getCharacterPools(options);
  const { length } = options;
  if (pools.length === 0 || !Number.isInteger(length) || length < pools.length) return null;

  const charset = pools.join('');
  const coversEveryPool = (candidate: string) =>
    pools.every(pool => Array.from(pool).some(char => candidate.includes(char)));

  let password = randomString(charset, length);
  while (!coversEveryPool(password)) password = randomString(charset, length);

  const entropy = calculateEntropy(length, pools.map(pool => pool.length));
  return { password, strength: rateStrength(entropy), entropy };
}

export function clampBatchSize(count: number): number {
  return clamp(count, 1, MAX_BATCH_SIZE, 1);
}

export function generateMultiplePasswords(count: number, options: PasswordOptions): GeneratedPassword[] {
  return Array.from({ length: clampBatchSize(count) }, () => generatePassword(options)).filter(
    result => result !== null
  );
}

export function clampWordCount(count: number): number {
  return clamp(count, MIN_PASSPHRASE_WORDS, MAX_PASSPHRASE_WORDS, DEFAULT_PASSPHRASE_WORDS);
}

export function generatePassphrase(wordCount = DEFAULT_PASSPHRASE_WORDS, separator = '-'): GeneratedPassword {
  const count = clampWordCount(wordCount);
  const entropy = count * Math.log2(EFF_LONG_WORDLIST.length);
  const words = Array.from({ length: count }, () => EFF_LONG_WORDLIST[randomIndex(EFF_LONG_WORDLIST.length)]);
  return { password: words.join(separator), strength: rateStrength(entropy), entropy };
}
