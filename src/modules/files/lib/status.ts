import type { User } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import { diskSpace } from '@/lib/storage'
import type { FilesStatusDto, StorageUser } from '@/modules/files/lib/api-types'
import { getSettings, quotaOf, usageOf } from '@/modules/files/lib/settings'
import { CHUNK_SIZE } from '@/modules/files/lib/uploads'

/** Things shared with `user` since they last opened Shared with me. */
export function newShares(user: User): Promise<number> {
  return prisma.share.count({
    where: {
      user_id: user.id,
      item: { trashed_at: null },
      ...(user.shares_seen_at ? { created_at: { gt: user.shares_seen_at } } : {}),
    },
  })
}

export async function describeStatus(user: User): Promise<FilesStatusDto> {
  const [settings, usage, unseen, disk] = await Promise.all([getSettings(), usageOf(user.id), newShares(user), diskSpace()])
  return {
    usage,
    quota: quotaOf(user, settings),
    maxUploadBytes: settings.maxUploadBytes,
    chunkSize: CHUNK_SIZE,
    newShares: unseen,
    disk,
  }
}

export function toStorageUser(user: User, usage: number): StorageUser {
  return {
    id: user.id,
    username: user.username,
    avatar: user.avatar_key,
    usage,
    quotaMode: !user.quota_custom ? 'default' : user.quota_bytes === null ? 'unlimited' : 'custom',
    quota: user.quota_custom && user.quota_bytes !== null ? Number(user.quota_bytes) : null,
  }
}
