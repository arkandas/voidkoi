import { Readable } from 'node:stream'
import type { Item } from '@/generated/prisma/client'
import { inlineType, previewKind } from '@/lib/file-types'
import { contentDisposition, parseRange } from '@/lib/http'
import { fileSize, readStored } from '@/lib/storage'

/** Nothing served here may run as this site. PDFs go without it: the browser's viewer refuses a sandbox. */
const SANDBOX = "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'; sandbox"

function stream(source: Readable): ReadableStream<Uint8Array> {
  return Readable.toWeb(source) as ReadableStream<Uint8Array>
}

/**
 * Whether a link's file goes out as a download, which counts toward the
 * link's limit: when asked for as one, and whenever the page can't show the
 * file, which then arrives as a download anyway. What the viewer shows in the
 * page, and a book the reader opens, are previews.
 */
export function countsAsDownload(item: Pick<Item, 'mime' | 'name'>, asked: boolean): boolean {
  return asked || (inlineType(item.mime, item.name) === null && previewKind(item.mime, item.name) !== 'epub')
}

/**
 * Serve a stored file, whole or a byte range of it. Shown in the page only
 * when it is a type the viewer can show safely; anything else is a download
 * of opaque bytes. `whole` sends all of it, whatever the request asks for:
 * a counted download never lets part of the file go uncounted.
 */
export async function serveFile(request: Request, item: Item, options: { download: boolean; whole?: boolean }): Promise<Response> {
  const key = item.storage_key
  const size = key ? await fileSize('files', key) : null
  if (!key || size === null) {
    if (key) console.error(`Item ${item.id} has a row but no file on disk`)
    return new Response(null, { status: 404 })
  }

  const etag = `"${key}"`
  const inline = options.download ? null : inlineType(item.mime, item.name)
  const type = inline ?? 'application/octet-stream'
  const headers = new Headers({
    'Content-Type': type,
    'Accept-Ranges': options.whole ? 'none' : 'bytes',
    'Content-Disposition': contentDisposition(inline ? 'inline' : 'attachment', item.name),
    'Cache-Control': 'private, no-cache',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  })
  if (type !== 'application/pdf') headers.set('Content-Security-Policy', SANDBOX)

  if (!options.whole && request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })

  const range = options.whole ? null : parseRange(request.headers.get('range'), size)
  if (range === 'unsatisfiable') {
    headers.set('Content-Range', `bytes */${size}`)
    return new Response(null, { status: 416, headers })
  }
  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${size}`)
    headers.set('Content-Length', String(range.end - range.start + 1))
    return new Response(stream(readStored('files', key, range)), { status: 206, headers })
  }
  headers.set('Content-Length', String(size))
  return new Response(size === 0 ? null : stream(readStored('files', key)), { status: 200, headers })
}

/** A WebP made from a file: its thumbnail, or its preview. The URL carries a version, so it can be cached. */
async function serveRendition(request: Request, item: Item, area: 'thumbs' | 'previews'): Promise<Response> {
  const key = item.storage_key
  const made = area === 'thumbs' ? item.has_thumbnail : item.has_preview
  const size = key && made ? await fileSize(area, key) : null
  if (!key || size === null) return new Response(null, { status: 404 })
  const etag = `"${area === 'thumbs' ? 't' : 'p'}-${key}"`
  const headers = new Headers({
    'Content-Type': 'image/webp',
    'Content-Length': String(size),
    'Cache-Control': 'private, max-age=86400',
    ETag: etag,
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': SANDBOX,
  })
  if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers })
  return new Response(stream(readStored(area, key)), { headers })
}

export function serveThumbnail(request: Request, item: Item): Promise<Response> {
  return serveRendition(request, item, 'thumbs')
}

export function servePreview(request: Request, item: Item): Promise<Response> {
  return serveRendition(request, item, 'previews')
}
