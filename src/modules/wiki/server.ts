import type { AppServer } from '@/modules/types'
import { startJobs } from '@/modules/wiki/lib/jobs'

export const server: AppServer = {
  // Nothing to collect for an account: pages and pictures belong to the wiki, and keep going without their author.
  startJobs,
}
