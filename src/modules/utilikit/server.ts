import { removeJobsOf, runningJobIds } from '@/modules/utilikit/lib/jobs'
import { sweepTempDir } from '@/modules/utilikit/lib/temp'
import type { AppServer } from '@/modules/types'

/** How often the temp folder is swept, and how old a leftover must be to go. */
const SWEEP_EVERY_MS = 60 * 60 * 1000
const LEFTOVER_AGE_MS = 6 * 60 * 60 * 1000

function sweep() {
  sweepTempDir(LEFTOVER_AGE_MS, runningJobIds()).catch(error => console.error('Sweeping Utilikit’s temp folder failed:', error))
}

export const server: AppServer = {
  /** Utilikit keeps nothing for an account but the jobs it is running: they go, with their files. */
  async collectAccountFiles(userId) {
    return () => removeJobsOf(userId)
  },
  /** Files from jobs a restart cut short, now and every hour. Finished jobs clean up after themselves. */
  startJobs() {
    sweep()
    setInterval(sweep, SWEEP_EVERY_MS).unref?.()
  },
}
