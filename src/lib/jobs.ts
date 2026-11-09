import { initStorage } from '@/lib/storage'
import { SERVERS } from '@/modules/servers'

let started = false

/** Each app's housekeeping, started once when the server starts. */
export async function startJobs(): Promise<void> {
  if (started) return
  started = true
  await initStorage()
  for (const [app, server] of Object.entries(SERVERS)) {
    try {
      await server.startJobs?.()
    } catch (error) {
      console.error(`Starting ${app}'s jobs failed:`, error)
    }
  }
}
