import { Readable } from 'node:stream'
import sharp from 'sharp'
import type { User } from '@/generated/prisma/client'
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from '@/lib/avatar'
import { ApiError } from '@/lib/error-codes'
import { newKey } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import { fileSize, readStored, removeFrom, writeStored } from '@/lib/storage'


/**
 * Store a profile picture. The browser has already cropped it; it is decoded
 * and encoded again here, which checks it really is a picture and drops
 * whatever else the file carried.
 */
export async function setAvatar(user: User, base64: string): Promise<User> {
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length === 0) throw new ApiError('invalidImage', 400)
  if (bytes.length > AVATAR_MAX_BYTES) throw new ApiError('imageTooLarge', 413)

  let image: Buffer
  try {
    image = await sharp(bytes, { failOn: 'error', limitInputPixels: 4096 * 4096 })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: 'cover' })
      .webp({ quality: 84 })
      .toBuffer()
  } catch {
    throw new ApiError('invalidImage', 400)
  }

  const key = newKey()
  await writeStored('avatars', key, image)
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatar_key: key } })
  if (user.avatar_key) await removeFrom('avatars', user.avatar_key).catch(() => {})
  return updated
}

export async function clearAvatar(user: User): Promise<User> {
  const updated = await prisma.user.update({ where: { id: user.id }, data: { avatar_key: null } })
  if (user.avatar_key) await removeFrom('avatars', user.avatar_key).catch(() => {})
  return updated
}

/** A picture's address changes with it (its key is in the URL), so it can be cached for good. */
export async function serveAvatar(user: Pick<User, 'avatar_key'>): Promise<Response> {
  const key = user.avatar_key
  const size = key ? await fileSize('avatars', key) : null
  if (!key || size === null) return new Response(null, { status: 404 })
  return new Response(Readable.toWeb(readStored('avatars', key)) as ReadableStream<Uint8Array>, {
    headers: {
      'Content-Type': 'image/webp',
      'Content-Length': String(size),
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
