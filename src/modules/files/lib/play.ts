import type { Item } from '@/generated/prisma/client'
import { playsDirectly, previewKind } from '@/lib/file-types'
import { probe, startStream, streamType } from '@/modules/files/lib/playback'
import { storagePath } from '@/lib/storage'

/** The player's routes, for signed-in people and for links alike. */

function playable(item: Item): boolean {
  const kind = previewKind(item.mime, item.name)
  return item.kind === 'FILE' && !!item.storage_key && (kind === 'video' || kind === 'audio')
}

/**
 * What the player shows before it plays: length, picture size, tags, whether
 * the browser plays it as it is, and the type of the server's stream.
 */
export async function mediaResponse(item: Item): Promise<Response> {
  if (!playable(item)) return new Response(null, { status: 404 })
  const info = await probe(storagePath('files', item.storage_key!), item.storage_key!)
  if (!info || (!info.video && !info.audio)) return Response.json({ playable: false }, { headers: { 'Cache-Control': 'no-store' } })
  return Response.json(
    {
      playable: true,
      direct: playsDirectly(item.mime),
      duration: info.duration,
      video: info.video ? { width: info.video.width, height: info.video.height } : null,
      stream: streamType(info),
      title: info.title,
      artist: info.artist,
      album: info.album,
    },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  )
}

/** The file converted for the browser as it plays, from `?t=` seconds. `viaLink`: for a link, with its own limit on streams. */
export async function streamResponse(request: Request, item: Item, viaLink = false): Promise<Response> {
  if (!playable(item)) return new Response(null, { status: 404 })
  const path = storagePath('files', item.storage_key!)
  const info = await probe(path, item.storage_key!)
  if (!info || (!info.video && !info.audio)) return new Response(null, { status: 415 })

  const requested = Number(new URL(request.url).searchParams.get('t') ?? 0)
  const limit = info.duration ?? Number.POSITIVE_INFINITY
  const start = Number.isFinite(requested) && requested > 0 ? Math.min(requested, limit) : 0

  const stream = startStream(path, info, start, request.signal, viaLink)
  if (stream === 'busy') return new Response(null, { status: 503, headers: { 'Retry-After': '5' } })
  return new Response(stream.body, {
    headers: {
      'Content-Type': stream.type,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
    },
  })
}
