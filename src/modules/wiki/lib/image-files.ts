import { createReadStream, type ReadStream } from 'node:fs'
import { mkdir, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isKey } from '@/lib/ids'
import { dataPath } from '@/lib/storage'

/** The wiki's pictures on disk: `wiki/images/ab/abXXXX…`, named by their key. */
const ROOT = () => dataPath('wiki', 'images')

function pathOf(key: string): string {
  if (!isKey(key)) throw new Error(`Not a storage key: ${key}`)
  return join(ROOT(), key.slice(0, 2), key)
}

export async function writeImage(key: string, bytes: Uint8Array): Promise<void> {
  const path = pathOf(key)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, bytes, { flag: 'wx' })
}

export async function imageSize(key: string): Promise<number | null> {
  try {
    return (await stat(pathOf(key))).size
  } catch {
    return null
  }
}

export function readImage(key: string): ReadStream {
  return createReadStream(pathOf(key))
}

export async function removeImage(key: string): Promise<void> {
  await rm(pathOf(key), { force: true })
}

/** Every key on disk, for finding files the database doesn't know. */
export async function imageKeys(): Promise<string[]> {
  const keys: string[] = []
  let folders: string[]
  try {
    folders = await readdir(ROOT())
  } catch {
    return keys
  }
  for (const folder of folders) {
    try {
      for (const name of await readdir(join(ROOT(), folder))) if (isKey(name)) keys.push(name)
    } catch {}
  }
  return keys
}
