import { createReadStream, type ReadStream } from 'node:fs'
import { mkdir, open, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { isKey } from '@/lib/ids'

/**
 * The bytes on disk, in the data directory. The database says what a file
 * is and who may see it; this is where it lives:
 *
 *   avatars/ab/abXXXX…          profile pictures
 *   files/stored/ab/abXXXX…     files uploaded to Files, named by their storage key
 *   files/thumbs/ab/abXXXX…     their thumbnails (WebP), same key
 *   files/previews/ab/abXXXX…   images browsers can't show (HEIC, TIFF) as WebP, same key
 *   files/incoming/abXXXX…      uploads still arriving, named by the upload id
 *
 * An upload is written to `incoming` and moved into `stored` only once all of
 * it has arrived, so a half-written file is never served. Other apps keep
 * their bytes in a folder of their own, from `dataPath`.
 */
const ROOT = resolve(process.env.VOIDKOI_DATA_DIR || join(/*turbopackIgnore: true*/ process.cwd(), 'data'))

export type Area = 'files' | 'thumbs' | 'previews' | 'avatars' | 'incoming'

const AREAS: Area[] = ['files', 'thumbs', 'previews', 'avatars', 'incoming']

const FOLDERS: Record<Area, string> = {
  avatars: 'avatars',
  files: 'files/stored',
  thumbs: 'files/thumbs',
  previews: 'files/previews',
  incoming: 'files/incoming',
}

/** A path in the data directory, for an app's own files: `dataPath('notes', 'images')`. */
export function dataPath(...segments: string[]): string {
  return join(/*turbopackIgnore: true*/ ROOT, ...segments)
}

export class ChunkTooLongError extends Error {}

export function storagePath(area: Area, key: string): string {
  if (!isKey(key)) throw new Error(`Not a storage key: ${key}`)
  return area === 'incoming'
    ? join(/*turbopackIgnore: true*/ ROOT, FOLDERS.incoming, key)
    : join(/*turbopackIgnore: true*/ ROOT, FOLDERS[area], key.slice(0, 2), key)
}

export async function initStorage(): Promise<void> {
  await Promise.all(AREAS.map(area => mkdir(join(/*turbopackIgnore: true*/ ROOT, FOLDERS[area]), { recursive: true })))
}

/** An empty file for an upload to be written into. */
export async function createIncoming(uploadId: string): Promise<void> {
  await mkdir(join(/*turbopackIgnore: true*/ ROOT, FOLDERS.incoming), { recursive: true })
  const handle = await open(storagePath('incoming', uploadId), 'w')
  await handle.close()
}

/**
 * Write a request body into an upload at `offset`. Pieces of one upload can
 * arrive at the same time: each writes its own range. Throws once more than
 * `expected` bytes arrive. Returns how many did.
 */
export async function writeAt(
  uploadId: string,
  offset: number,
  body: ReadableStream<Uint8Array>,
  expected: number,
): Promise<number> {
  const handle = await open(storagePath('incoming', uploadId), 'r+')
  const reader = body.getReader()
  let written = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (written + value.byteLength > expected) throw new ChunkTooLongError()
      let at = 0
      while (at < value.byteLength) {
        const { bytesWritten } = await handle.write(value, at, value.byteLength - at, offset + written + at)
        at += bytesWritten
      }
      written += value.byteLength
    }
    return written
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    await handle.close()
  }
}

export async function incomingSize(uploadId: string): Promise<number | null> {
  try {
    return (await stat(storagePath('incoming', uploadId))).size
  } catch {
    return null
  }
}

/** Move a finished upload to where files live, under its storage key. */
export async function promote(uploadId: string, key: string): Promise<void> {
  const target = storagePath('files', key)
  await mkdir(dirname(target), { recursive: true })
  await rename(storagePath('incoming', uploadId), target)
}

export async function removeIncoming(uploadId: string): Promise<void> {
  await rm(storagePath('incoming', uploadId), { force: true })
}

/** A file with its thumbnail and preview. Already gone is fine: the end state is the same. */
export async function removeStored(key: string): Promise<void> {
  await Promise.all([
    rm(storagePath('files', key), { force: true }),
    rm(storagePath('thumbs', key), { force: true }),
    rm(storagePath('previews', key), { force: true }),
  ])
}

export async function fileSize(area: Area, key: string): Promise<number | null> {
  try {
    return (await stat(storagePath(area, key))).size
  } catch {
    return null
  }
}

export function readStored(area: Area, key: string, range?: { start: number; end: number }): ReadStream {
  return createReadStream(storagePath(area, key), range ? { start: range.start, end: range.end } : undefined)
}

export async function writeStored(area: Area, key: string, bytes: Uint8Array): Promise<void> {
  const target = storagePath(area, key)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, bytes)
}

export async function removeFrom(area: Area, key: string): Promise<void> {
  await rm(storagePath(area, key), { force: true })
}

/** Every key with a file in an area, for finding files the database no longer knows. */
export async function listKeys(area: Area): Promise<string[]> {
  const base = join(/*turbopackIgnore: true*/ ROOT, FOLDERS[area])
  if (area === 'incoming') {
    return (await readdir(base).catch(() => [] as string[])).filter(isKey)
  }
  const keys: string[] = []
  for (const shard of await readdir(base).catch(() => [] as string[])) {
    for (const name of await readdir(join(/*turbopackIgnore: true*/ base, shard)).catch(() => [] as string[])) {
      if (isKey(name)) keys.push(name)
    }
  }
  return keys
}

/** The size of the disk the data is kept on, and what is free on it. Null when the system can't say. */
export async function diskSpace(): Promise<{ total: number; free: number } | null> {
  try {
    await mkdir(ROOT, { recursive: true })
    const { bsize, blocks, bavail } = await statfs(ROOT)
    return { total: blocks * bsize, free: bavail * bsize }
  } catch {
    return null
  }
}
