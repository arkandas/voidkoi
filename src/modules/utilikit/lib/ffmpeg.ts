import { spawn } from 'child_process'
import { ToolError } from '@/modules/utilikit/lib/tool-error'
import { MEDIA_DEMUXERS } from '@/lib/media-input'

export interface MediaInfo {
  duration: number
  bitrate: number
  video?: {
    codec: string
    width: number
    height: number
    bitrate: number
    colorSpace: string
    colorTransfer: string
    colorPrimaries: string
    rotation: number
  }
  audio?: {
    codec: string
    bitrate: number
    sampleRate: number
  }
}

interface ProbeStream {
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  bit_rate?: string
  sample_rate?: string
  color_space?: string
  color_transfer?: string
  color_primaries?: string
  tags?: { rotate?: string }
  side_data_list?: Array<{ rotation?: number }>
}

interface ProbeOutput {
  streams?: ProbeStream[]
  format?: { duration?: string; bit_rate?: string }
}

const PROBE_ENTRIES =
  'stream=codec_name,codec_type,width,height,bit_rate,sample_rate,color_space,color_transfer,color_primaries:stream_tags=rotate:stream_side_data=rotation:format=duration,bit_rate'

function toNumber(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : parseFloat(value ?? '')
  return Number.isFinite(parsed) ? parsed : fallback
}

function rotationOf(stream: ProbeStream): number {
  const fromSideData = stream.side_data_list?.find(entry => typeof entry.rotation === 'number')?.rotation
  const degrees = fromSideData ?? toNumber(stream.tags?.rotate, 0)
  return ((Math.round(degrees / 90) * 90) % 360 + 360) % 360
}

export function parseProbeOutput(output: string): MediaInfo {
  const data: ProbeOutput = JSON.parse(output)
  const video = data.streams?.find(stream => stream.codec_type === 'video')
  const audio = data.streams?.find(stream => stream.codec_type === 'audio')
  const bitrate = toNumber(data.format?.bit_rate, 0)
  const rotation = video ? rotationOf(video) : 0
  const sideways = rotation === 90 || rotation === 270

  return {
    duration: toNumber(data.format?.duration, 0),
    bitrate,
    video: video && {
      codec: video.codec_name ?? 'unknown',
      width: (sideways ? video.height : video.width) ?? (sideways ? 1080 : 1920),
      height: (sideways ? video.width : video.height) ?? (sideways ? 1920 : 1080),
      bitrate: toNumber(video.bit_rate, bitrate || 5_000_000),
      colorSpace: video.color_space ?? 'unknown',
      colorTransfer: video.color_transfer ?? 'unknown',
      colorPrimaries: video.color_primaries ?? 'unknown',
      rotation,
    },
    audio: audio && {
      codec: audio.codec_name ?? 'unknown',
      bitrate: toNumber(audio.bit_rate, 192_000),
      sampleRate: toNumber(audio.sample_rate, 0),
    },
  }
}

export function probeMedia(inputPath: string): Promise<MediaInfo> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffprobe', ['-v', 'error', '-show_entries', PROBE_ENTRIES, '-of', 'json', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, inputPath])
    let output = ''

    child.stdout.on('data', data => {
      output += data.toString()
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code !== 0) return reject(new Error(`ffprobe exited with code ${code}`))
      try {
        resolve(parseProbeOutput(output))
      } catch (error) {
        reject(error)
      }
    })
  })
}

export function parseTimemark(line: string): number | null {
  const match = line.match(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/)
  if (!match) return null
  return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseFloat(match[3])
}

export function runFfmpeg(args: string[], duration = 0, onProgress?: (percent: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args)
    let tail = ''

    child.stderr.on('data', data => {
      const text = data.toString()
      tail = (tail + text).slice(-8000)
      if (!onProgress || duration <= 0) return

      for (const line of text.split(/[\r\n]/)) {
        const seconds = parseTimemark(line)
        if (seconds !== null) onProgress(Math.min((seconds / duration) * 100, 99))
      }
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve(tail)
      else reject(new ToolError('conversionFailed', `ffmpeg exited with code ${code}`, 400, tail.trim().split('\n').pop()))
    })
  })
}
