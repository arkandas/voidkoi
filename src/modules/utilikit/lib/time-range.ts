import { mediaInput } from '@/lib/media-input'
export interface TrimRange {
  start: number
  duration: number
}

export type TrimResult = { ok: true; trim: TrimRange | null } | { ok: false }

const TIMESTAMP = /^(?:(\d+):)?(?:(\d+):)?(\d+(?:[.,]\d+)?)$/

export function parseTimestamp(value: string): number | null {
  const match = TIMESTAMP.exec(value.trim())
  if (!match) return null

  const [, first, second, rest] = match
  const hours = second !== undefined ? Number(first) : 0
  const minutes = second !== undefined ? Number(second) : first !== undefined ? Number(first) : 0
  const seconds = Number(rest.replace(',', '.'))

  if ((first !== undefined || second !== undefined) && seconds >= 60) return null
  if (second !== undefined && minutes >= 60) return null
  return hours * 3600 + minutes * 60 + seconds
}

export function formatTimestamp(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = Math.round((safe % 60) * 100) / 100
  const secondsText = (seconds < 10 ? '0' : '') + String(seconds)

  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${secondsText}` : `${minutes}:${secondsText}`
}

export function resolveTrim(start: number | null, end: number | null, duration: number): TrimResult {
  const from = start ?? 0
  if (!Number.isFinite(from) || from < 0 || (end !== null && !Number.isFinite(end))) return { ok: false }

  const known = Number.isFinite(duration) && duration > 0
  if (known && from >= duration) return { ok: false }
  if (end !== null && end <= from) return { ok: false }

  const to = end === null ? (known ? duration : null) : known ? Math.min(end, duration) : end
  if (from === 0 && (to === null || (known && to >= duration))) return { ok: true, trim: null }
  if (to === null) return { ok: false }

  return { ok: true, trim: { start: from, duration: to - from } }
}

export function parseTrimFields(start: unknown, end: unknown, duration: number): TrimResult {
  const read = (value: unknown) => {
    if (value === null || value === undefined || value === '') return null
    const number = Number(value)
    return Number.isFinite(number) ? number : Number.NaN
  }
  return resolveTrim(read(start), read(end), duration)
}

/** ffmpeg's input: a local file of a plain media container, so nothing it names can make ffmpeg open a URL or another file. */
export function inputArgs(file: string): string[] {
  return mediaInput(file)
}

export function trimInputArgs(trim: TrimRange | null): string[] {
  return trim ? ['-ss', trim.start.toFixed(3)] : []
}

export function trimOutputArgs(trim: TrimRange | null): string[] {
  return trim ? ['-t', trim.duration.toFixed(3)] : []
}
