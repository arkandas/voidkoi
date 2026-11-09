import { spawn } from 'child_process'
import { lookup } from 'dns/promises'
import { copyFile, readdir } from 'fs/promises'
import { isIP } from 'net'
import path from 'path'
import type { ExtractFormat } from '@/modules/utilikit/lib/audio-convert'
import type { ApiErrorCode } from '@/lib/error-codes'
import { ToolError } from '@/modules/utilikit/lib/tool-error'
import { mediaProxy } from '@/modules/utilikit/lib/media-proxy'
import { isPrivateAddress, parseHttpUrl } from '@/modules/utilikit/lib/safe-fetch'
import { getTempDir, removeFiles, tempPath } from '@/modules/utilikit/lib/temp'
import { MAX_ITEMS, type MediaSummary, type VideoQuality } from '@/modules/utilikit/lib/video-download'

export { availableQualities, isVideoQuality, MAX_ITEMS, VIDEO_QUALITIES } from '@/modules/utilikit/lib/video-download'
export type { MediaItem, MediaSummary, VideoQuality } from '@/modules/utilikit/lib/video-download'

export const MAX_FILE_SIZE = '4G'

/**
 * Only formats fetched over HTTP, which goes through the guarded proxy. RTMP,
 * RTSP, MMS and WebSocket streams would connect on their own, to anywhere.
 */
const OVER_HTTP = "[protocol!~='rtmp|rtsp|mms|websocket']"
const INFO_TIMEOUT_MS = 90_000
const JS_RUNTIME_VERSION = '2025.11.12'

export interface DownloadOptions {
  url: string
  item?: number
  audioOnly: boolean
  audioFormat: ExtractFormat
  quality: VideoQuality
  outputTemplate: string
}

type Info = Record<string, unknown>
type Format = { width?: unknown; height?: unknown; vcodec?: unknown; acodec?: unknown }

export function parseMediaUrl(value: unknown): string | null {
  const url = parseHttpUrl(value)
  if (!url || url.username || url.password) return null

  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (isIP(host) || !host.includes('.') || /\.(local|localhost|internal|lan|home\.arpa)$/.test(host)) return null
  return url.toString()
}

/** The early, friendly check. yt-dlp looks names up again itself, so its connections go through mediaProxy, which checks each one. */
export async function resolvesPublicly(url: string): Promise<boolean> {
  try {
    const addresses = await lookup(new URL(url).hostname, { all: true })
    return addresses.length > 0 && addresses.every(({ address }) => !isPrivateAddress(address))
  } catch {
    return false
  }
}

let versionPromise: Promise<string | null> | null = null

export function ytDlpVersion(): Promise<string | null> {
  versionPromise ??= new Promise(resolve => {
    const child = spawn('yt-dlp', ['--version'])
    let output = ''
    child.stdout.on('data', data => {
      output += data.toString()
    })
    child.on('error', () => resolve(null))
    child.on('close', code => resolve(code === 0 ? output.trim() : null))
  })
  return versionPromise
}

/** yt-dlp with every connection it makes going through `proxy`, which reaches public addresses only. */
function spawnYtDlp(proxy: string, args: string[]) {
  // libcurl, which yt-dlp uses for some sites, would let the names in NO_PROXY bypass the proxy.
  return spawn('yt-dlp', ['--proxy', proxy, ...args], { env: { ...process.env, NO_PROXY: undefined, no_proxy: undefined } })
}

export function commonArgs(version: string | null, cookies: string | null): string[] {
  const args = ['--ies', 'default,-generic', '--no-warnings', '--socket-timeout', '30']
  if (version && version >= JS_RUNTIME_VERSION) args.push('--js-runtimes', 'node')
  if (cookies) args.push('--cookies', cookies)
  return args
}

export async function withCookies<T>(run: (cookies: string | null) => Promise<T>): Promise<T> {
  const source = process.env.VOIDKOI_YTDLP_COOKIES?.trim()
  if (!source) return run(null)

  const copy = await tempPath(`cookies-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`)
  try {
    await copyFile(source, copy)
  } catch (error) {
    console.error('VOIDKOI_YTDLP_COOKIES could not be read:', error)
    return run(null)
  }

  try {
    return await run(copy)
  } finally {
    await removeFiles(copy)
  }
}

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)
const number = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined)
const webUrl = (value: unknown) => {
  const url = text(value)
  return url && /^https?:\/\//i.test(url) ? url : undefined
}

function thumbnailOf(info: Info): string | undefined {
  const direct = webUrl(info.thumbnail)
  if (direct) return direct
  const thumbnails = Array.isArray(info.thumbnails) ? (info.thumbnails as Info[]) : []
  return thumbnails.map(thumbnail => webUrl(thumbnail.url)).filter(Boolean).pop()
}

function formatsOf(info: Info): Format[] {
  if (Array.isArray(info.formats)) return info.formats as Format[]
  return info.vcodec !== undefined || info.height !== undefined ? [info as Format] : []
}

const isVideo = (format: Format) => format.vcodec !== 'none' && (number(format.height) !== undefined || typeof format.vcodec === 'string')

function resolutionOf(format: Format): number | undefined {
  const height = number(format.height)
  const width = number(format.width)
  return height && width ? Math.min(height, width) : height
}

export function summarizeInfo(info: Info, url: string): MediaSummary {
  if (info.is_live === true || info.live_status === 'is_live' || info.live_status === 'is_upcoming') {
    throw new ToolError('liveNotSupported')
  }

  const entries = info._type === 'playlist' && Array.isArray(info.entries) ? (info.entries as Info[]).filter(Boolean) : []
  const sources = entries.length > 0 ? entries : [info]
  const formats = sources.flatMap(formatsOf)
  const heights = [
    ...new Set(formats.filter(isVideo).map(resolutionOf).filter((height): height is number => height !== undefined)),
  ].sort((a, b) => b - a)

  return {
    url,
    site: text(info.webpage_url_domain) ?? text(info.extractor_key) ?? new URL(url).hostname,
    title: text(info.title) ?? text(entries[0]?.title) ?? new URL(url).hostname,
    thumbnail: thumbnailOf(info) ?? (entries[0] ? thumbnailOf(entries[0]) : undefined),
    duration: number(info.duration),
    uploader: text(info.uploader) ?? text(info.channel),
    heights,
    audioOnly: formats.length > 0 && !formats.some(isVideo),
    items:
      entries.length > 1
        ? entries.slice(0, MAX_ITEMS).map((entry, index) => ({
            index: index + 1,
            title: text(entry.title) ?? `#${index + 1}`,
            thumbnail: thumbnailOf(entry),
            duration: number(entry.duration),
          }))
        : [],
  }
}

export function classifyYtDlpError(message: string, fallback: ApiErrorCode = 'downloadFailed'): ApiErrorCode {
  const lower = message.toLowerCase()
  if (/unsupported url|no suitable extractor/.test(lower)) return 'unsupportedUrl'
  if (/does not pass filter|is live|live event|currently live|premieres in/.test(lower)) return 'liveNotSupported'
  if (/ip address is blocked|geo.?restrict|available in your country|blocked it in your country/.test(lower)) return 'mediaBlocked'
  if (/private video|video is private|has been removed|was deleted|no longer available|(video|post) (is )?unavailable|does not exist|not found|http error 404/.test(lower)) {
    return 'mediaUnavailable'
  }
  if (/sign in|log in|logged-in|login required|use --cookies|account credentials|authentication/.test(lower)) return 'loginRequired'
  if (/max-filesize/.test(lower)) return 'fileTooLarge'
  if (/requested format is not available|no video formats found/.test(lower)) return 'noDownloadableFormat'
  return fallback
}

function lastError(stderr: string): string {
  return stderr.split('\n').filter(line => line.startsWith('ERROR')).pop()?.replace(/^ERROR:\s*/, '') ?? stderr.trim().split('\n').pop() ?? ''
}

export function fetchMediaInfo(url: string): Promise<MediaSummary> {
  return withCookies(async cookies => {
    const version = await ytDlpVersion()
    const args = [...commonArgs(version, cookies), '-J', '--flat-playlist', '--no-playlist', '-I', `1:${MAX_ITEMS}`, '--', url]
    const { url: proxy } = await mediaProxy()

    const output = await new Promise<string>((resolve, reject) => {
      const child = spawnYtDlp(proxy, args)
      let stdout = ''
      let stderr = ''
      const timer = setTimeout(() => child.kill('SIGKILL'), INFO_TIMEOUT_MS)

      child.stdout.on('data', data => {
        stdout += data.toString()
      })
      child.stderr.on('data', data => {
        stderr = (stderr + data.toString()).slice(-4000)
      })
      child.on('error', error => {
        clearTimeout(timer)
        reject(error)
      })
      child.on('close', (code, signal) => {
        clearTimeout(timer)
        if (code === 0) return resolve(stdout)
        if (signal) return reject(new ToolError('fetchFailed', 'Timed out'))
        const message = lastError(stderr)
        reject(new ToolError(classifyYtDlpError(message, 'fetchFailed'), message))
      })
    })

    try {
      return summarizeInfo(JSON.parse(output), url)
    } catch (error) {
      if (error instanceof ToolError) throw error
      throw new ToolError('parseFailed', error instanceof Error ? error.message : String(error))
    }
  })
}

export function buildDownloadArgs(options: DownloadOptions, version: string | null, cookies: string | null): string[] {
  const args = [
    ...commonArgs(version, cookies),
    '-o', options.outputTemplate,
    '--no-playlist',
    '-I', String(options.item ?? 1),
    '--no-simulate',
    '--no-mtime',
    '--max-filesize', MAX_FILE_SIZE,
    '--match-filter', '!is_live',
    '--print', 'before_dl:TITLE:%(title)s',
    '--print', 'after_move:FILE:%(filepath)s',
    '--progress',
    '--newline',
  ]

  if (options.audioOnly) {
    args.push('-f', `ba${OVER_HTTP}/b${OVER_HTTP}`, '-x', '--audio-format', options.audioFormat, '--audio-quality', '0')
  } else {
    const resolution = options.quality === 'best' ? 'res' : `res:${options.quality}`
    args.push('-f', `bv*${OVER_HTTP}+ba${OVER_HTTP}/b${OVER_HTTP}`, '-S', `${resolution},fps,vcodec:h264,acodec:aac`, '--merge-output-format', 'mp4')
  }

  return [...args, '--', options.url]
}

export function parseYtDlpProgress(line: string): number | null {
  const match = line.match(/\[download\]\s+(\d+(?:\.\d+)?)%/)
  return match ? parseFloat(match[1]) : null
}

export function downloadMedia(
  options: DownloadOptions,
  onProgress?: (percent: number) => void,
): Promise<{ filepath: string; title: string }> {
  return withCookies(async cookies => {
    const args = buildDownloadArgs(options, await ytDlpVersion(), cookies)
    const { url: proxy } = await mediaProxy()

    return new Promise((resolve, reject) => {
      const child = spawnYtDlp(proxy, args)
      let filepath = ''
      let title = ''
      let skipped = ''
      let stderr = ''
      let pending = ''

      const handleLine = (line: string) => {
        if (line.startsWith('TITLE:')) title = line.slice(6).trim()
        else if (line.startsWith('FILE:')) filepath = line.slice(5).trim()
        else if (/does not pass filter|larger than max-filesize/.test(line)) skipped = line
        else {
          const percent = parseYtDlpProgress(line)
          if (percent !== null) onProgress?.(percent)
        }
      }

      child.stdout.on('data', data => {
        const lines = (pending + data.toString()).split(/\r?\n/)
        pending = lines.pop() ?? ''
        lines.forEach(handleLine)
      })
      child.stderr.on('data', data => {
        stderr = (stderr + data.toString()).slice(-4000)
      })
      child.on('error', reject)
      child.on('close', code => {
        if (pending) handleLine(pending)
        if (code === 0 && filepath) return resolve({ filepath, title })
        const message = skipped || lastError(stderr) || `yt-dlp exited with code ${code}`
        reject(new ToolError(classifyYtDlpError(message), `yt-dlp exited with code ${code}`, 400, message))
      })
    })
  })
}

export async function removeDownloadFiles(prefix: string) {
  const names = await readdir(getTempDir()).catch(() => [] as string[])
  await removeFiles(...names.filter(name => name.startsWith(prefix)).map(name => path.join(getTempDir(), name)))
}
