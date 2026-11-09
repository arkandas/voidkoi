import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import sharp, { type Metadata, type Sharp, type SharpOptions } from 'sharp'
import type { Prisma } from '@/generated/prisma/client'
import { isMarkdown, needsPreview, thumbnailSource } from '@/lib/file-types'
import { audioCover, epubCover, heicPixels, pdfPage, textPage, videoFrame } from '@/modules/files/lib/media'
import { prisma } from '@/lib/prisma'
import { storagePath } from '@/lib/storage'

/** Thumbnails fit in this square. Big enough for the grid on a retina screen. */
const EDGE = 480

/** Previews fit in this one: sharp on a big screen, a fraction of a camera original. */
const PREVIEW_EDGE = 2560

/** Pictures with more pixels are not read: the biggest photos phones take have 200 million. */
const MAX_PIXELS = 200_000_000

/** What sharp may read in someone's picture, by its bytes. Never SVG, whatever the file is called. */
const RASTER_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'avif', 'heif', 'tiff'])

/** Every picture here is read through this, held to the pixel limit. */
function picture(input: string | Buffer | Uint8ClampedArray, options: SharpOptions = {}): Sharp {
  return sharp(input, { ...options, limitInputPixels: MAX_PIXELS })
}

/**
 * Someone's picture, read only when its bytes are one of the raster formats
 * Files expects. Sharp picks its decoder from the bytes, not the name.
 */
async function raster(input: string | Buffer, options: SharpOptions): Promise<{ image: Sharp; meta: Metadata } | null> {
  const image = picture(input, options)
  const meta = await image.metadata()
  return RASTER_FORMATS.has(meta.format ?? '') ? { image, meta } : null
}

const waiting: number[] = []
let running = false

/** Make thumbnails one at a time, so a folder of photos doesn't take every core. */
export function queueThumbnail(itemId: number): void {
  waiting.push(itemId)
  if (!running) void drain()
}

async function drain(): Promise<void> {
  running = true
  while (waiting.length > 0) {
    const id = waiting.shift()!
    await makeThumbnail(id).catch(error => console.error(`Thumbnail for item ${id} failed:`, error))
  }
  running = false
}

interface Source {
  image: ReturnType<typeof sharp>
  /** Upright, for the item's row. Unknown for videos and PDFs: their pictures are scaled down. */
  width: number | null
  height: number | null
}

/** The picture a file's thumbnail comes from, upright. Null when there is none, like a video without ffmpeg. */
async function sourceOf(mime: string | null, name: string, path: string): Promise<Source | null> {
  switch (thumbnailSource(mime, name)) {
    case 'image': {
      const found = await raster(path, { failOn: 'none', animated: false })
      if (!found) return null
      const { image, meta } = found
      // Orientations 5 to 8 are a quarter turn: width and height swap.
      const turned = (meta.orientation ?? 1) >= 5
      return {
        image: image.rotate(),
        width: (turned ? meta.height : meta.width) ?? null,
        height: (turned ? meta.width : meta.height) ?? null,
      }
    }
    case 'heic': {
      const { data, width, height } = await heicPixels(path)
      return { image: picture(data, { raw: { width, height, channels: 4 } }), width, height }
    }
    case 'video': {
      const frame = await videoFrame(path)
      return frame ? { image: picture(frame), width: null, height: null } : null
    }
    case 'audio': {
      const cover = await audioCover(path)
      return cover ? { image: picture(cover), width: null, height: null } : null
    }
    case 'pdf': {
      const page = await pdfPage(path)
      return page ? { image: picture(page), width: null, height: null } : null
    }
    case 'epub': {
      const cover = await epubCover(path)
      const found = cover ? await raster(cover, { failOn: 'none' }) : null
      return found ? { image: found.image, width: null, height: null } : null
    }
    case 'text': {
      // The page is an SVG drawn here, from escaped text: the one SVG sharp reads.
      const page = await textPage(path, isMarkdown(mime, name))
      return page ? { image: picture(page), width: null, height: null } : null
    }
    default:
      return null
  }
}

/**
 * Make a file's thumbnail, and its preview when it needs one. Either way the
 * file is marked as tried, so the catch-up at startup doesn't try it again.
 */
export async function makeThumbnail(itemId: number): Promise<boolean> {
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  const key = item?.storage_key
  if (!item || !key) return false
  // Only if it still holds these bytes: a replaced file gets its own thumbnail.
  const mark = (data: Prisma.ItemUpdateManyMutationInput) =>
    prisma.item.updateMany({ where: { id: itemId, storage_key: key }, data: { ...data, thumbnail_tried: true } })

  try {
    const made = await render(item.mime, item.name, key)
    const { count } = await mark(made ?? {})
    return made !== null && count > 0
  } catch (error) {
    await mark({}).catch(() => {})
    throw error
  }
}

/** The thumbnail and preview files for a file's bytes, and what to note on its row. Null when it gets none. */
async function render(mime: string | null, name: string, key: string): Promise<Prisma.ItemUpdateManyMutationInput | null> {
  const source = await sourceOf(mime, name, storagePath('files', key))
  if (!source) return null

  const thumb = storagePath('thumbs', key)
  await mkdir(dirname(thumb), { recursive: true })
  await source.image
    .clone()
    .resize({ width: EDGE, height: EDGE, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(thumb)

  const preview = needsPreview(mime)
  if (preview) {
    const target = storagePath('previews', key)
    await mkdir(dirname(target), { recursive: true })
    await source.image
      .clone()
      .resize({ width: PREVIEW_EDGE, height: PREVIEW_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(target)
  }

  return { has_thumbnail: true, has_preview: preview, width: source.width, height: source.height }
}
