import { Readable } from 'node:stream'
import sharp, { type OutputInfo } from 'sharp'
import type { User } from '@/generated/prisma/client'
import type { ImageDto } from '@/modules/wiki/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { newKey } from '@/lib/ids'
import { imageUrl } from '@/modules/wiki/lib/markdown/images'
import { prisma } from '@/lib/prisma'
import { imageKeys, imageSize, readImage, removeImage, writeImage } from '@/modules/wiki/lib/image-files'

/** What an upload may weigh before it is re-encoded. */
export const IMAGE_MAX_BYTES = 25 * 1024 * 1024

/** The longest side kept: bigger photos are shrunk to it. */
const MAX_EDGE = 2560

/**
 * Store a picture for a page. It is decoded and encoded again, which checks it
 * is a picture, turns it upright, drops its metadata (where a photo was taken)
 * and shrinks what is far bigger than a page shows. Animated GIFs stay animated.
 */
export async function storeImage(user: User, bytes: Buffer): Promise<ImageDto> {
  if (bytes.length === 0) throw new ApiError('invalidImage', 400)
  if (bytes.length > IMAGE_MAX_BYTES) throw new ApiError('imageTooLarge', 413)

  let output: { data: Buffer; info: OutputInfo }
  let mime: string
  try {
    const input = sharp(bytes, { failOn: 'error', animated: true, limitInputPixels: 12000 * 12000 })
    const meta = await input.metadata()
    const pipeline = input.rotate().resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true })
    // Screenshots and drawings keep their sharp edges as PNG; photos and animations become WebP.
    if (meta.format === 'png' && (meta.pages ?? 1) === 1) {
      output = await pipeline.png({ compressionLevel: 9, palette: false }).toBuffer({ resolveWithObject: true })
      mime = 'image/png'
    } else {
      output = await pipeline.webp({ quality: 84 }).toBuffer({ resolveWithObject: true })
      mime = 'image/webp'
    }
  } catch {
    throw new ApiError('invalidImage', 400)
  }

  const key = newKey()
  const height = output.info.pageHeight ?? output.info.height
  // The row first: the cleanup never sees a file without one and takes it for a stray.
  const row = await prisma.wikiImage.create({
    data: { key, mime, size: output.data.length, width: output.info.width, height, uploaded_by_id: user.id },
  })
  try {
    await writeImage(key, output.data)
  } catch (error) {
    await prisma.wikiImage.delete({ where: { id: row.id } }).catch(() => {})
    throw error
  }
  return { url: imageUrl(key), width: output.info.width, height }
}

/**
 * Cached by the browser only: a page made private later stops showing its
 * pictures to anyone it no longer lets in, which a shared cache wouldn't.
 */
export async function serveImage(image: { key: string; mime: string }): Promise<Response> {
  const size = await imageSize(image.key)
  if (size === null) return new Response(null, { status: 404 })
  return new Response(Readable.toWeb(readImage(image.key)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': image.mime,
      'Content-Length': String(size),
      // The key is the image: it never changes under the same address.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

/**
 * Remove images no draft or revision shows any more, a day after their upload
 * (one just pasted may not be saved yet), and files the database doesn't know.
 */
export async function removeUnusedImages(now = new Date()): Promise<number> {
  const before = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const unused = await prisma.$queryRaw<Array<{ id: number; key: string }>>`
    SELECT i.id, i.key FROM wiki_images i
    WHERE i.created_at < ${before}
      AND NOT EXISTS (SELECT 1 FROM wiki_revisions r WHERE strpos(r.content, i.key) > 0)
      AND NOT EXISTS (SELECT 1 FROM wiki_nodes n WHERE n.draft_content IS NOT NULL AND strpos(n.draft_content, i.key) > 0)`
  for (const image of unused) {
    await prisma.wikiImage.delete({ where: { id: image.id } })
    await removeImage(image.key).catch(() => {})
  }

  // The files first, then the rows: an image's row is written before its file,
  // so one uploaded meanwhile is already known when the rows are read.
  const onDisk = await imageKeys()
  const known = new Set((await prisma.wikiImage.findMany({ select: { key: true } })).map(image => image.key))
  let strays = 0
  for (const key of onDisk) {
    if (!known.has(key)) {
      await removeImage(key).catch(() => {})
      strays++
    }
  }
  return unused.length + strays
}
