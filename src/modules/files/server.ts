import { prisma } from '@/lib/prisma'
import { removeIncoming, removeStored } from '@/lib/storage'
import { startFilesJobs } from '@/modules/files/lib/jobs'
import { newShares } from '@/modules/files/lib/status'
import type { AppServer } from '@/modules/types'

export const server: AppServer = {
  async collectAccountFiles(userId) {
    const [files, uploads] = await Promise.all([
      prisma.item.findMany({ where: { owner_id: userId, NOT: { storage_key: null } }, select: { storage_key: true } }),
      prisma.upload.findMany({ where: { owner_id: userId }, select: { id: true } }),
    ])
    return async () => {
      for (const file of files) await removeStored(file.storage_key!).catch(() => {})
      for (const upload of uploads) await removeIncoming(upload.id).catch(() => {})
    }
  },
  startJobs: startFilesJobs,
  async badge(userId) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    return user ? newShares(user) : 0
  },
}
