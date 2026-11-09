import { spawn } from 'node:child_process'
import { Readable } from 'node:stream'
import { MEDIA_DEMUXERS } from '@/lib/media-input'
import { has } from '@/modules/files/lib/media'

/**
 * Videos and audio a browser can't play as they are, played through ffmpeg:
 * converted as they stream, and only as much as is needed. H.264 video and
 * AAC audio are copied, the rest converted. Seeking starts a new stream at
 * that point.
 */

export interface MediaInfo {
  /** In seconds, when the file says. */
  duration: number | null
  video: {
    index: number
    codec: string
    width: number
    height: number
    pixFmt: string | null
    profile: string | null
    level: number | null
  } | null
  audio: { index: number; codec: string; profile: string | null } | null
  title: string | null
  artist: string | null
  album: string | null
}

interface ProbeStream {
  index: number
  codec_type?: string
  codec_name?: string
  width?: number
  height?: number
  pix_fmt?: string
  profile?: string
  level?: number
  disposition?: { attached_pic?: number }
  side_data_list?: Array<{ rotation?: number | string }>
  tags?: Record<string, string>
}

interface Probe {
  streams?: ProbeStream[]
  format?: { duration?: string; tags?: Record<string, string> }
}

const PROBE_TIMEOUT_MS = 15_000

/** Phones store portrait video on its side, with a turn to show it upright. */
function turnedSideways(stream: ProbeStream): boolean {
  const turn = Number(stream.side_data_list?.find(data => data.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0)
  return Math.abs(turn) % 180 === 90
}

function tag(tags: Record<string, string> | undefined, name: string): string | null {
  if (!tags) return null
  const key = Object.keys(tags).find(candidate => candidate.toLowerCase() === name)
  const value = key ? tags[key]?.trim() : ''
  return value ? value.slice(0, 200) : null
}

/** The parts of ffprobe's report the player needs. */
export function readProbe(probe: Probe): MediaInfo {
  const streams = probe.streams ?? []
  // Album art comes as a video stream too: it isn't the video.
  const video = streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
  const audio = streams.find(stream => stream.codec_type === 'audio')
  const duration = Number(probe.format?.duration)
  return {
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    video: video
      ? {
          index: video.index,
          codec: video.codec_name ?? '',
          // The size as shown.
          width: (turnedSideways(video) ? video.height : video.width) ?? 0,
          height: (turnedSideways(video) ? video.width : video.height) ?? 0,
          pixFmt: video.pix_fmt ?? null,
          profile: video.profile ?? null,
          level: typeof video.level === 'number' && video.level > 0 ? video.level : null,
        }
      : null,
    audio: audio ? { index: audio.index, codec: audio.codec_name ?? '', profile: audio.profile ?? null } : null,
    title: tag(probe.format?.tags, 'title'),
    artist: tag(probe.format?.tags, 'artist') ?? tag(probe.format?.tags, 'album_artist'),
    album: tag(probe.format?.tags, 'album'),
  }
}

const probes = new Map<string, Promise<MediaInfo | null>>()

/** What is in a file, read once per stored file. Null without ffprobe, or for a file it can't read. */
export function probe(path: string, key: string): Promise<MediaInfo | null> {
  let found = probes.get(key)
  if (!found) {
    found = runProbe(path)
    probes.set(key, found)
    // A small memory: the files someone is playing now.
    if (probes.size > 200) probes.delete(probes.keys().next().value!)
  }
  return found
}

async function runProbe(path: string): Promise<MediaInfo | null> {
  if (!(await has('ffprobe', '-version'))) return null
  return new Promise(resolve => {
    const child = spawn(
      'ffprobe',
      ['-v', 'error', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS, '-show_format', '-show_streams', '-of', 'json', path],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
    const chunks: Buffer[] = []
    const timer = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS)
    child.stdout.on('data', (chunk: Buffer) => chunks.push(chunk))
    child.on('error', () => {
      clearTimeout(timer)
      resolve(null)
    })
    child.on('close', code => {
      clearTimeout(timer)
      if (code !== 0) return resolve(null)
      try {
        resolve(readProbe(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Probe))
      } catch {
        resolve(null)
      }
    })
  })
}

/** The H.264 profiles browsers play, with how they are written in a codecs string. */
const H264_PROFILES: Record<string, string> = {
  'Constrained Baseline': '42e0',
  Baseline: '4200',
  Main: '4d40',
  High: '6400',
}

/** H.264 in 8-bit 4:2:0 plays everywhere: it is copied, not converted. */
function copiesVideo(video: NonNullable<MediaInfo['video']>): boolean {
  return (
    video.codec === 'h264' &&
    (video.pixFmt === null || video.pixFmt === 'yuv420p' || video.pixFmt === 'yuvj420p') &&
    (video.profile === null || video.profile in H264_PROFILES)
  )
}

/** Converted video is High profile at level 4.2, enough for 1080p at 60 frames a second. */
const CONVERTED_VIDEO = 'avc1.64002a'

/**
 * The type of the stream the server sends, codecs included, which a player
 * feeding it to the browser piece by piece (Media Source) has to name.
 */
export function streamType(info: MediaInfo): string {
  if (!info.video) return 'audio/mpeg'
  const { video, audio } = info
  const videoCodec = copiesVideo(video)
    ? `avc1.${H264_PROFILES[video.profile ?? 'High']}${(video.level ?? 40).toString(16).padStart(2, '0')}`
    : CONVERTED_VIDEO
  const audioCodec = !audio ? null : audio.codec === 'aac' && audio.profile === 'HE-AAC' ? 'mp4a.40.5' : 'mp4a.40.2'
  return `video/mp4; codecs="${[videoCodec, audioCodec].filter(Boolean).join(',')}"`
}

/**
 * The ffmpeg arguments for a stream from `start` seconds: fragmented MP4 with
 * H.264 and AAC for a video, MP3 for audio.
 */
export function streamArgs(info: MediaInfo, input: string, start: number): string[] {
  const args = ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file', '-format_whitelist', MEDIA_DEMUXERS]
  if (start > 0) args.push('-ss', start.toFixed(3))
  args.push('-i', input, '-sn', '-dn', '-map_metadata', '-1')

  if (!info.video) {
    args.push('-map', `0:${info.audio!.index}`, '-vn')
    if (info.audio!.codec === 'mp3') args.push('-c:a', 'copy')
    else args.push('-c:a', 'libmp3lame', '-b:a', '192k')
    args.push('-f', 'mp3', 'pipe:1')
    return args
  }

  args.push('-map', `0:${info.video.index}`)
  if (copiesVideo(info.video)) {
    args.push('-c:v', 'copy')
  } else {
    args.push(
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level:v', '4.2',
      // At most 1080p, the long side either way.
      '-vf', "scale=w='min(iw,if(gt(iw,ih),1920,1080))':h='min(ih,if(gt(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2",
    )
  }
  if (info.audio) {
    args.push('-map', `0:${info.audio.index}`)
    if (info.audio.codec === 'aac') args.push('-c:a', 'copy')
    else args.push('-c:a', 'aac', '-b:a', '160k', '-ac', '2')
  }
  args.push('-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-f', 'mp4', 'pipe:1')
  return args
}

/** Conversions at a time: each can keep a core or two busy. */
const MAX_STREAMS = 3
/** How many of them links may hold, so people signed in always have one. */
const MAX_LINK_STREAMS = 2

/**
 * The conversions running, and how many came through links. One count for
 * the process: each route may get its own copy of this module.
 */
const globalForStreams = globalThis as unknown as { filesStreams?: { all: number; links: number } }
const running = (globalForStreams.filesStreams ??= { all: 0, links: 0 })

/**
 * A stream of a file from `start` seconds, ended when the listener goes away.
 * 'busy' when enough streams are running already, or, for a link, enough
 * through links.
 */
export function startStream(
  path: string,
  info: MediaInfo,
  start: number,
  signal: AbortSignal,
  viaLink = false,
): { body: ReadableStream<Uint8Array>; type: string } | 'busy' {
  if (running.all >= MAX_STREAMS || (viaLink && running.links >= MAX_LINK_STREAMS)) return 'busy'
  running.all += 1
  if (viaLink) running.links += 1
  const child = spawn('ffmpeg', streamArgs(info, path, start), { stdio: ['ignore', 'pipe', 'ignore'] })
  let ended = false
  const end = () => {
    if (ended) return
    ended = true
    running.all -= 1
    if (viaLink) running.links -= 1
  }
  child.on('close', end)
  child.on('error', end)
  signal.addEventListener('abort', () => child.kill('SIGKILL'), { once: true })
  return {
    body: Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
    type: info.video ? 'video/mp4' : 'audio/mpeg',
  }
}
