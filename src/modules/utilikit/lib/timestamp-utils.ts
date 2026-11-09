export type TimestampUnit = 'seconds' | 'milliseconds';

export interface ParsedTimestamp {
  ms: number;
  unit: TimestampUnit;
}

export interface TimestampFormats {
  seconds: number;
  milliseconds: number;
  iso: string;
}

const MAX_TIMESTAMP_MS = 8.64e15;
const MILLISECONDS_THRESHOLD = 1e11;

export function isValidTimestampMs(ms: number): boolean {
  return Number.isFinite(ms) && Math.abs(ms) <= MAX_TIMESTAMP_MS;
}

export function detectTimestampUnit(value: number): TimestampUnit {
  return Math.abs(value) >= MILLISECONDS_THRESHOLD ? 'milliseconds' : 'seconds';
}

export function parseUnixTimestamp(input: string): ParsedTimestamp | null {
  const text = input.trim();
  if (!text) return null;

  const value = Number(text);
  if (!Number.isFinite(value)) return null;

  const unit = detectTimestampUnit(value);
  const ms = Math.round(unit === 'seconds' ? value * 1000 : value) || 0;
  return isValidTimestampMs(ms) ? { ms, unit } : null;
}

export function parseDateString(input: string): number | null {
  const text = input.trim();
  if (!text) return null;

  const ms = new Date(text).getTime();
  return isValidTimestampMs(ms) ? ms : null;
}

export function getTimestampFormats(ms: number): TimestampFormats {
  return {
    seconds: Math.floor(ms / 1000),
    milliseconds: ms,
    iso: new Date(ms).toISOString(),
  };
}

export function formatDateTime(ms: number, locale: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'full', timeStyle: 'long', timeZone }).format(ms);
}
