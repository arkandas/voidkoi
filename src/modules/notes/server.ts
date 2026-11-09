import { prisma } from '@/lib/prisma'
import { removeImages } from '@/modules/notes/lib/images'
import { startNotesJobs } from '@/modules/notes/lib/jobs'
import type { AppServer } from '@/modules/types'

export const server: AppServer = {
  /** The pictures pasted into the account's notes. Its notes and folders go with its rows. */
  async collectAccountFiles(userId) {
    const images = await prisma.noteImage.findMany({ where: { user_id: userId }, select: { id: true, mime: true } })
    return () => removeImages(images)
  },
  startJobs: startNotesJobs,
}
