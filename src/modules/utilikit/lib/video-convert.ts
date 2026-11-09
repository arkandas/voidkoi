import type { MediaInfo } from '@/modules/utilikit/lib/ffmpeg'
import { inputArgs, trimInputArgs, trimOutputArgs, type TrimRange } from '@/modules/utilikit/lib/time-range'
import { ownValue } from '@/modules/utilikit/lib/validate'

export const VIDEO_PRESETS = ['faster', 'fast', 'medium', 'slow', 'slower'] as const
export type VideoPreset = (typeof VIDEO_PRESETS)[number]

export interface VideoCodec {
  format: string
  extension: string
  videoCodec: string
  audioCodec: string
  codecName: string
}

export const VIDEO_CODECS: Record<string, VideoCodec> = {
  'mp4-h264': { format: 'mp4', extension: 'mp4', videoCodec: 'libx264', audioCodec: 'aac', codecName: 'h264' },
  'mp4-h265': { format: 'mp4', extension: 'mp4', videoCodec: 'libx265', audioCodec: 'aac', codecName: 'hevc' },
  'webm-vp9': { format: 'webm', extension: 'webm', videoCodec: 'libvpx-vp9', audioCodec: 'libopus', codecName: 'vp9' },
  'webm-av1': { format: 'webm', extension: 'webm', videoCodec: 'libaom-av1', audioCodec: 'libopus', codecName: 'av1' },
  mov: { format: 'mov', extension: 'mov', videoCodec: 'libx264', audioCodec: 'aac', codecName: 'h264' },
  mkv: { format: 'matroska', extension: 'mkv', videoCodec: 'libx264', audioCodec: 'aac', codecName: 'h264' },
  gif: { format: 'gif', extension: 'gif', videoCodec: 'gif', audioCodec: '', codecName: 'gif' },
}

export const GIF_FRAME_RATES = [10, 15, 20] as const
export type GifFrameRate = (typeof GIF_FRAME_RATES)[number]
export const MAX_GIF_SECONDS = 60

const RESOLUTIONS: Record<string, number> = {
  '1080': 1080,
  '720': 720,
  '480': 480,
  '360': 360,
}

const VP9_CPU_USED: Record<VideoPreset, number> = { faster: 4, fast: 3, medium: 2, slow: 1, slower: 0 }
const AV1_CPU_USED: Record<VideoPreset, number> = { faster: 8, fast: 7, medium: 6, slow: 5, slower: 4 }

export interface VideoOptions {
  quality: number
  resolution: string
  customWidth?: number
  customHeight?: number
  preset: VideoPreset
  keepAudio: boolean
  trim?: TrimRange | null
  gifFrameRate?: GifFrameRate
}

type Source = NonNullable<MediaInfo['video']>

function even(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

export function resolveResolution(source: Source, options: VideoOptions): { width: number; height: number } {
  let width = source.width
  let height = source.height

  if (options.resolution === 'custom') {
    width = Math.min(options.customWidth || source.width, source.width)
    height = Math.min(options.customHeight || source.height, source.height)
  } else if (ownValue(RESOLUTIONS, options.resolution)) {
    const scale = Math.min(1, RESOLUTIONS[options.resolution] / Math.min(source.width, source.height))
    width = source.width * scale
    height = source.height * scale
  }

  return { width: even(width), height: even(height) }
}

export function isWideGamut(source: Source): boolean {
  return (
    source.colorPrimaries === 'bt2020' ||
    source.colorSpace === 'bt2020nc' ||
    source.colorSpace === 'bt2020c' ||
    source.colorTransfer === 'smpte2084' ||
    source.colorTransfer === 'arib-std-b67'
  )
}

function audioBitrate(info: MediaInfo, quality: number): string {
  if (quality === 100) return `${Math.round((info.audio?.bitrate ?? 128_000) / 1000)}k`
  return quality >= 80 ? '192k' : quality >= 50 ? '128k' : '96k'
}

function buildGifArgs(
  inputPath: string,
  outputPath: string,
  size: { width: number; height: number },
  wideGamut: boolean,
  options: VideoOptions,
): string[] {
  const fps = options.gifFrameRate ?? 15
  const toneMap = wideGamut ? 'colorspace=all=bt709:iall=bt2020,' : ''
  const filter = [
    `${toneMap}fps=${fps},scale=${size.width}:${size.height}:flags=lanczos,split[a][b]`,
    '[a]palettegen=stats_mode=diff[palette]',
    '[b][palette]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle',
  ].join(';')

  return [
    ...trimInputArgs(options.trim ?? null),
    ...inputArgs(inputPath),
    ...trimOutputArgs(options.trim ?? null),
    '-filter_complex',
    filter,
    '-loop',
    '0',
    '-an',
    '-f',
    'gif',
    '-y',
    outputPath,
  ]
}

export function buildVideoArgs(
  inputPath: string,
  outputPath: string,
  codec: VideoCodec,
  info: MediaInfo,
  options: VideoOptions,
): string[] {
  const source = info.video
  if (!source) throw new Error('No video stream found')

  const { width, height } = resolveResolution(source, options)
  const wideGamut = isWideGamut(source)
  if (codec.format === 'gif') return buildGifArgs(inputPath, outputPath, { width, height }, wideGamut, options)

  const trim = options.trim ?? null
  const args = [...trimInputArgs(trim), ...inputArgs(inputPath), ...trimOutputArgs(trim), '-f', codec.format]

  if (codec.format === 'mp4' || codec.format === 'mov') args.push('-movflags', '+faststart')
  if (codec.codecName === 'hevc') args.push('-tag:v', 'hvc1')

  const streamCopy =
    !trim &&
    source.codec === codec.codecName &&
    width === even(source.width) &&
    height === even(source.height) &&
    options.quality === 100 &&
    !wideGamut

  if (streamCopy) {
    args.push('-c:v', 'copy')
    args.push(...(options.keepAudio ? ['-c:a', 'copy'] : ['-an']))
    return [...args, '-y', outputPath]
  }

  args.push('-c:v', codec.videoCodec, '-s', `${width}x${height}`)

  if (wideGamut) {
    args.push('-vf', 'colorspace=all=bt709:iall=bt2020,format=yuv420p')
    args.push('-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709')
  } else {
    args.push('-pix_fmt', 'yuv420p')
  }

  args.push('-b:v', `${Math.max(1, Math.round((source.bitrate / 1000) * (options.quality / 100)))}k`)

  if (codec.videoCodec === 'libx264' || codec.videoCodec === 'libx265') args.push('-preset', options.preset)
  if (codec.videoCodec === 'libvpx-vp9') args.push('-cpu-used', String(VP9_CPU_USED[options.preset]), '-row-mt', '1')
  if (codec.videoCodec === 'libaom-av1') args.push('-cpu-used', String(AV1_CPU_USED[options.preset]), '-row-mt', '1')

  if (options.keepAudio && info.audio) args.push('-c:a', codec.audioCodec, '-b:a', audioBitrate(info, options.quality))
  else args.push('-an')

  return [...args, '-y', outputPath]
}
