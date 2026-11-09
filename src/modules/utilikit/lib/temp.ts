import { mkdir, mkdtemp, readdir, rm, stat, unlink } from 'fs/promises'
import path from 'path'
import { dataPath } from '@/lib/storage'

/** Where uploads wait for a tool and results wait to be downloaded. */
export function getTempDir(): string {
  return dataPath('utilikit', 'tmp')
}

export async function tempPath(name: string): Promise<string> {
  const dir = getTempDir()
  await mkdir(dir, { recursive: true })
  return path.join(dir, name)
}

/** A new, empty folder in the temp directory, for one job's files alone. */
export async function tempFolder(prefix: string): Promise<string> {
  const dir = getTempDir()
  await mkdir(dir, { recursive: true })
  return mkdtemp(path.join(dir, prefix))
}

export function safeExtension(filename: string, fallback: string): string {
  const extension = filename.split('.').pop()?.toLowerCase() ?? ''
  return /^[a-z0-9]{1,8}$/.test(extension) ? extension : fallback
}

export async function removeFiles(...files: Array<string | null | undefined>) {
  await Promise.all(
    files.filter((file): file is string => Boolean(file)).map(file => unlink(file).catch(() => {})),
  )
}

/**
 * Removes what is left in the temp directory from work that ended without
 * cleaning up, such as a server restart in the middle of a job: entries older
 * than `maxAgeMs` whose name doesn't carry the id of a job still running.
 * Returns how many it removed.
 */
export async function sweepTempDir(maxAgeMs: number, runningIds: readonly string[] = [], now = Date.now()): Promise<number> {
  const dir = getTempDir()
  let removed = 0
  for (const name of await readdir(dir).catch(() => [] as string[])) {
    if (runningIds.some(id => name.includes(id))) continue
    const entry = path.join(dir, name)
    const info = await stat(entry).catch(() => null)
    if (!info || now - info.mtimeMs < maxAgeMs) continue
    await rm(entry, { recursive: true, force: true }).catch(() => {})
    removed++
  }
  return removed
}
