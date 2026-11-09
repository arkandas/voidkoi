import { dataPath } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { countUnseenMissed } from '@/modules/talk/backend/calls'
import { totalUnread } from '@/modules/talk/backend/conversations'
import { FileStore } from '@/modules/talk/backend/files/store'
import { talkHub } from '@/modules/talk/backend/hub'
import { startTalkJobs } from '@/modules/talk/backend/jobs'
import type { AppServer } from '@/modules/types'

export const server: AppServer = {
  /** The files the account sent. Its rows go with it; the conversations and groups stay for the others in them. */
  async collectAccountFiles(userId) {
    const files = await prisma.talkAttachment.findMany({ where: { uploader_id: userId }, select: { id: true } })
    return async () => {
      const store = new FileStore(dataPath('talk'))
      for (const file of files) await store.remove(file.id).catch(() => {})
    }
  },
  startJobs: startTalkJobs,
  /** Unread messages and missed calls not yet seen: what Talk's own Chats and Calls count. */
  async badge(userId) {
    const { db } = await talkHub()
    const [unread, missed] = await Promise.all([totalUnread(db, userId), countUnseenMissed(db, userId)])
    return unread + missed
  },
}
