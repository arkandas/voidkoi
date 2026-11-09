import { describe, expect, it } from 'vitest';
import {
  clampBatchSize,
  generateMultipleUUIDs,
  generateUUID,
  MAX_BATCH_SIZE,
  UUID_VERSIONS,
  validateUUID,
} from '@/modules/utilikit/lib/uuid-utils';

const RFC_V4_EXAMPLE = '919108f7-52d1-4320-9bac-f847db4148a8';
const RFC_V7_EXAMPLE = '017F22E2-79B0-7CC3-98C4-DC0C0C07398F';

function bytesOf(uuid: string): number[] {
  expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  return Array.from(uuid.replace(/-/g, '').matchAll(/../g), ([pair]) => parseInt(pair, 16));
}

function timestampOf(uuid: string): number {
  return parseInt(uuid.replace(/-/g, '').slice(0, 12), 16);
}

describe('generateUUID', () => {
  it.each([
    ['v4', 4],
    ['v7', 7],
  ] as const)('sets the RFC 9562 version and variant bits for %s', (version, versionNumber) => {
    for (const uuid of generateMultipleUUIDs(MAX_BATCH_SIZE, version)) {
      const bytes = bytesOf(uuid);
      expect(bytes).toHaveLength(16);
      expect(bytes[6] >> 4).toBe(versionNumber);
      expect(bytes[8] >> 6).toBe(0b10);
    }
  });

  it('starts v7 UUIDs with the current Unix time in milliseconds', () => {
    expect(timestampOf(RFC_V7_EXAMPLE)).toBe(Date.UTC(2022, 1, 22, 19, 22, 22));

    const before = Date.now();
    const timestamp = timestampOf(generateUUID('v7'));
    const after = Date.now();
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it('keeps v7 UUIDs in generation order, even within the same millisecond', () => {
    const before = Date.now();
    const batch = generateMultipleUUIDs(MAX_BATCH_SIZE, 'v7');
    const after = Date.now();

    const timestamps = batch.map(timestampOf);
    timestamps.forEach((timestamp, index) => {
      expect(timestamp).toBeGreaterThanOrEqual(index === 0 ? before : timestamps[index - 1]);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
    expect([...batch].sort()).toEqual(batch);
  });

  it('never repeats a UUID within a batch', () => {
    for (const version of UUID_VERSIONS) {
      expect(new Set(generateMultipleUUIDs(MAX_BATCH_SIZE, version)).size).toBe(MAX_BATCH_SIZE);
    }
  });
});

describe('batch size', () => {
  it.each([
    [5, 5],
    [1, 1],
    [0, 1],
    [-3, 1],
    [2.9, 2],
    [100, 100],
    [101, 100],
    [10_000, 100],
    [Number.POSITIVE_INFINITY, 100],
    [Number.NaN, 1],
  ])('clamps %s to %s', (count, expected) => {
    expect(clampBatchSize(count)).toBe(expected);
    expect(generateMultipleUUIDs(count, 'v4')).toHaveLength(expected);
  });
});

describe('validateUUID', () => {
  it('accepts v4 and v7 UUIDs in either case, including the RFC 9562 examples', () => {
    expect(validateUUID(RFC_V4_EXAMPLE)).toBe(true);
    expect(validateUUID(RFC_V4_EXAMPLE.toUpperCase())).toBe(true);
    expect(validateUUID(RFC_V7_EXAMPLE)).toBe(true);
    expect(validateUUID(generateUUID('v4'))).toBe(true);
    expect(validateUUID(generateUUID('v7'))).toBe(true);
  });

  it.each([
    ['the nil UUID', '00000000-0000-0000-0000-000000000000'],
    ['the max UUID', 'ffffffff-ffff-ffff-ffff-ffffffffffff'],
    ['a v1 UUID', 'c232ab00-9414-11ec-b3c8-9f6bdeced846'],
    ['a v5 UUID', '2ed6657d-e927-568b-95e1-2665a8aea6a2'],
    ['a v6 UUID', '1ec9414c-232a-6b00-b3c8-9f6bdeced846'],
    ['a non-RFC variant', '919108f7-52d1-4320-cbac-f847db4148a8'],
    ['a string one character too short', '919108f7-52d1-4320-9bac-f847db4148a'],
    ['a string one character too long', '919108f7-52d1-4320-9bac-f847db4148a80'],
    ['a string without hyphens', '919108f752d143209bacf847db4148a8'],
    ['misplaced hyphens', '919108f75-2d1-4320-9bac-f847db4148a8'],
    ['non-hex characters', '919108f7-52d1-4320-9bac-f847db4148ag'],
    ['surrounding whitespace', ` ${RFC_V4_EXAMPLE} `],
    ['an empty string', ''],
  ])('rejects %s', (_, value) => {
    expect(validateUUID(value)).toBe(false);
  });
});
