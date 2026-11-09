import { v4, v7 } from 'uuid';

export const UUID_VERSIONS = ['v7', 'v4'] as const;
export type UUIDVersion = (typeof UUID_VERSIONS)[number];

export const MAX_BATCH_SIZE = 100;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateUUID(version: UUIDVersion): string {
  return version === 'v7' ? v7() : v4();
}

export function clampBatchSize(count: number): number {
  return Number.isNaN(count) ? 1 : Math.min(MAX_BATCH_SIZE, Math.max(1, Math.trunc(count)));
}

export function generateMultipleUUIDs(count: number, version: UUIDVersion): string[] {
  return Array.from({ length: clampBatchSize(count) }, () => generateUUID(version));
}

export function validateUUID(value: string): boolean {
  return UUID_PATTERN.test(value);
}
