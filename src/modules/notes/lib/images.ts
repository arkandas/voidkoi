import { createHash } from 'node:crypto'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { prisma } from '@/lib/prisma'
import { dataPath } from '@/lib/storage'

/**
 * Pictures pasted into notes, on disk as data/notes/images/<id>.<ext>. The id
 * is a hash of the account and the bytes: pasting the same picture twice keeps
 * one copy, and each account's pictures are its own.
 */

const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
}

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/** All of an account's note pictures together. */
export const MAX_ACCOUNT_IMAGE_BYTES = 1024 * 1024 * 1024

/** A picture nothing uses is kept this long, for undo and for cut and paste. */
const GRACE_MS = 24 * 60 * 60 * 1000

export const IMAGE_PATH = '/api/notes/images/'

/** The type the bytes themselves say, whatever the browser claimed. Null for anything but the pictures notes keep. */
export function sniffImageType(bytes: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to))
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(1, 4) === 'PNG' && bytes[4] === 0x0d && bytes[5] === 0x0a) return 'image/png'
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.length >= 6 && (ascii(0, 6) === 'GIF87a' || ascii(0, 6) === 'GIF89a')) return 'image/gif'
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (bytes.length >= 12 && ascii(4, 8) === 'ftyp' && ['avif', 'avis'].includes(ascii(8, 12))) return 'image/avif'
  return null
}

/** Whether a picture of `size` bytes still fits beside the account's others. The same picture again always fits. */
export async function roomFor(userId: number, id: string, size: number): Promise<boolean> {
  if (await prisma.noteImage.findFirst({ where: { id, user_id: userId }, select: { id: true } })) return true
  const used = await prisma.noteImage.aggregate({ where: { user_id: userId }, _sum: { bytes: true } })
  return (used._sum.bytes ?? 0) + size <= MAX_ACCOUNT_IMAGE_BYTES
}

export function extensionFor(mime: string): string {
  return EXTENSIONS[mime] ?? 'bin'
}

export function isImageId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}

export function imageId(userId: number, bytes: Uint8Array): string {
  return createHash('sha256').update(`${userId}:`).update(bytes).digest('hex')
}

export function imagePath(id: string, mime: string): string {
  if (!isImageId(id)) throw new Error('Bad image id')
  return dataPath('notes', 'images', `${id}.${extensionFor(mime)}`)
}

export function imageUrl(id: string): string {
  return `${IMAGE_PATH}${id}`
}

/** Every picture a note shows, once per mention. */
export function imageIdsIn(markdown: string): string[] {
  return [...markdown.matchAll(/\/api\/notes\/images\/([a-f0-9]{64})/g)].map(match => match[1])
}

/** Keep a picture for an account. The same picture again only restarts its grace period. */
export async function storeImage(
  userId: number,
  mime: string,
  bytes: Uint8Array,
  size: { width: number; height: number },
): Promise<string> {
  const id = imageId(userId, bytes)
  await prisma.noteImage.upsert({
    where: { id },
    update: { created_at: new Date() },
    create: { id, mime, width: size.width, height: size.height, bytes: bytes.length, user_id: userId },
  })
  const path = imagePath(id, mime)
  await mkdir(dirname(path), { recursive: true })
  // The id names the bytes, so a file already there is this picture.
  await writeFile(path, bytes, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EEXIST') throw error
  })
  return id
}

/** Pictures and their files, gone. A file already gone is fine. */
export async function removeImages(images: { id: string; mime: string }[]): Promise<void> {
  for (const image of images) {
    await prisma.noteImage.deleteMany({ where: { id: image.id } })
    await rm(imagePath(image.id, image.mime), { force: true })
  }
}

/**
 * Pictures no note of their account mentions any more, a day after they were
 * last added, and those whose account is gone. Notes in the trash still count.
 */
export async function sweepImages(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - GRACE_MS)
  const old = await prisma.noteImage.findMany({
    where: { created_at: { lt: cutoff } },
    select: { id: true, mime: true, user_id: true },
  })

  const byUser = new Map<number | null, typeof old>()
  for (const image of old) byUser.set(image.user_id, [...(byUser.get(image.user_id) ?? []), image])

  let removed = 0
  for (const [userId, images] of byUser) {
    for (const image of images) {
      // Looked up in the database, a picture at a time, rather than reading every note into memory.
      if (userId !== null && (await prisma.note.count({ where: { user_id: userId, content: { contains: image.id } } })) > 0) continue
      // Only if it wasn't pasted again meanwhile.
      const { count } = await prisma.noteImage.deleteMany({ where: { id: image.id, created_at: { lt: cutoff } } })
      if (count === 0) continue
      await rm(imagePath(image.id, image.mime), { force: true })
      removed += 1
    }
  }
  return removed
}
