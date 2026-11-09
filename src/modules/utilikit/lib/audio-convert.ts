import { inputArgs, trimInputArgs, trimOutputArgs, type TrimRange } from '@/modules/utilikit/lib/time-range'

export interface AudioFormat {
  extension: string
  codec: string
  lossy: boolean
}

export const AUDIO_FORMATS: Record<string, AudioFormat> = {
  mp3: { extension: 'mp3', codec: 'libmp3lame', lossy: true },
  aac: { extension: 'm4a', codec: 'aac', lossy: true },
  opus: { extension: 'opus', codec: 'libopus', lossy: true },
  vorbis: { extension: 'ogg', codec: 'libvorbis', lossy: true },
  flac: { extension: 'flac', codec: 'flac', lossy: false },
  wav: { extension: 'wav', codec: 'pcm_s16le', lossy: false },
}

export const EXTRACT_FORMATS = ['mp3', 'm4a', 'opus', 'ogg', 'wav'] as const
export type ExtractFormat = (typeof EXTRACT_FORMATS)[number]

const EXTRACT_ARGS: Record<ExtractFormat, string[]> = {
  mp3: ['-codec:a', 'libmp3lame', '-q:a', '0'],
  m4a: ['-codec:a', 'aac', '-q:a', '2'],
  opus: ['-codec:a', 'libopus', '-b:a', '128k'],
  ogg: ['-codec:a', 'libvorbis', '-q:a', '6'],
  wav: ['-codec:a', 'pcm_s16le'],
}

export function isExtractFormat(value: unknown): value is ExtractFormat {
  return typeof value === 'string' && (EXTRACT_FORMATS as readonly string[]).includes(value)
}

export function clampBitrate(value: number): number {
  return Math.min(Math.max(Math.round(value) || 192, 32), 512)
}

export const LOUDNESS_TARGET = { integrated: -16, truePeak: -1.5, range: 11 } as const

export interface LoudnessMeasurement {
  input_i: string
  input_tp: string
  input_lra: string
  input_thresh: string
  target_offset: string
}

export interface AudioOptions {
  bitrate: number
  trim?: TrimRange | null
  loudness?: LoudnessMeasurement | null
  sampleRate?: number
}

export function loudnormFilter(measured?: LoudnessMeasurement | null): string {
  const { integrated, truePeak, range } = LOUDNESS_TARGET
  const target = `loudnorm=I=${integrated}:TP=${truePeak}:LRA=${range}`
  if (!measured) return `${target}:print_format=json`
  return [
    target,
    `measured_I=${measured.input_i}`,
    `measured_TP=${measured.input_tp}`,
    `measured_LRA=${measured.input_lra}`,
    `measured_thresh=${measured.input_thresh}`,
    `offset=${measured.target_offset}`,
    'linear=true',
  ].join(':')
}

export function parseLoudness(stderr: string): LoudnessMeasurement | null {
  const start = stderr.lastIndexOf('{')
  const end = stderr.lastIndexOf('}')
  if (start === -1 || end < start) return null

  try {
    const data = JSON.parse(stderr.slice(start, end + 1))
    const fields = ['input_i', 'input_tp', 'input_lra', 'input_thresh', 'target_offset'] as const
    if (!fields.every(field => typeof data[field] === 'string' && Number.isFinite(Number(data[field])))) return null
    return Object.fromEntries(fields.map(field => [field, data[field]])) as unknown as LoudnessMeasurement
  } catch {
    return null
  }
}

export function buildLoudnessProbeArgs(inputPath: string, trim: TrimRange | null = null): string[] {
  return [...trimInputArgs(trim), ...inputArgs(inputPath), ...trimOutputArgs(trim), '-vn', '-af', loudnormFilter(), '-f', 'null', '-']
}

function outputSampleRate(format: AudioFormat, sampleRate = 0): number {
  if (format.codec === 'libopus') return 48000
  return sampleRate >= 8000 && sampleRate <= 48000 ? sampleRate : 48000
}

export function buildAudioArgs(inputPath: string, outputPath: string, format: AudioFormat, options: AudioOptions): string[] {
  const trim = options.trim ?? null
  const args = [...trimInputArgs(trim), ...inputArgs(inputPath), ...trimOutputArgs(trim), '-vn']
  if (options.loudness) args.push('-af', loudnormFilter(options.loudness), '-ar', String(outputSampleRate(format, options.sampleRate)))
  args.push('-c:a', format.codec)
  if (format.lossy) args.push('-b:a', `${clampBitrate(options.bitrate)}k`)
  return [...args, '-y', outputPath]
}

export function buildExtractArgs(inputPath: string, outputPath: string, format: ExtractFormat): string[] {
  return [...inputArgs(inputPath), '-vn', ...EXTRACT_ARGS[format], '-y', outputPath]
}
