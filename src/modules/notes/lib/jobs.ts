import { sweepImages } from '@/modules/notes/lib/images'

const HOUR = 60 * 60 * 1000

let started = false

async function sweep(): Promise<void> {
  const removed = await sweepImages()
  if (removed > 0) console.log(`Notes: removed ${removed} picture(s) no note uses`)
}

/** Housekeeping: pictures no note uses any more, at startup and every six hours. */
export async function startNotesJobs(): Promise<void> {
  if (started) return
  started = true
  void sweep().catch(error => console.error('Sweeping note pictures failed:', error))
  setInterval(() => void sweep().catch(error => console.error('Sweeping note pictures failed:', error)), 6 * HOUR).unref()
}
