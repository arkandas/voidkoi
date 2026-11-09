import { removeUnusedImages } from '@/modules/wiki/lib/images'
import { purgeTrash } from '@/modules/wiki/lib/pages'

const HOUR = 60 * 60 * 1000

let started = false

/** Housekeeping while the server runs: the trash empties itself after 30 days, unused images go. */
export function startJobs(): void {
  if (started) return
  started = true
  const run = async (): Promise<void> => {
    try {
      await purgeTrash()
      await removeUnusedImages()
    } catch (error) {
      console.error('Wiki housekeeping failed:', error)
    }
  }
  setTimeout(() => void run(), 60_000).unref()
  setInterval(() => void run(), 6 * HOUR).unref()
}
