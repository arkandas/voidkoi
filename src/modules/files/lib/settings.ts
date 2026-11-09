import type { User } from '@/generated/prisma/client'
import type { SettingsDto } from '@/modules/files/lib/api-types'
import { ApiError } from '@/lib/error-codes'
import { prisma, type Tx } from '@/lib/prisma'

export async function getSettings(db: Tx | typeof prisma = prisma): Promise<SettingsDto> {
  const row = await db.filesSettings.findUnique({ where: { id: 1 } })
  return {
    maxUploadBytes: row?.max_upload_bytes != null ? Number(row.max_upload_bytes) : null,
    defaultQuotaBytes: row?.default_quota_bytes != null ? Number(row.default_quota_bytes) : null,
    uploadLinkMaxBytes: row?.upload_link_max_bytes != null ? Number(row.upload_link_max_bytes) : null,
  }
}

export async function saveSettings(settings: SettingsDto): Promise<SettingsDto> {
  const big = (bytes: number | null) => (bytes === null ? null : BigInt(bytes))
  const data = {
    max_upload_bytes: big(settings.maxUploadBytes),
    default_quota_bytes: big(settings.defaultQuotaBytes),
    upload_link_max_bytes: big(settings.uploadLinkMaxBytes),
  }
  await prisma.filesSettings.upsert({ where: { id: 1 }, update: data, create: { id: 1, ...data } })
  return getSettings()
}

/** A user's storage limit in bytes, or null for none. */
export function quotaOf(user: Pick<User, 'quota_custom' | 'quota_bytes'>, settings: SettingsDto): number | null {
  if (!user.quota_custom) return settings.defaultQuotaBytes
  return user.quota_bytes === null ? null : Number(user.quota_bytes)
}

/** Everything a user stores, the trash included: deleting something frees the space when it leaves the trash. */
export async function usageOf(userId: number, db: Tx | typeof prisma = prisma): Promise<number> {
  const { _sum } = await db.item.aggregate({ where: { owner_id: userId, kind: 'FILE' }, _sum: { size: true } })
  return Number(_sum.size ?? 0)
}

export async function usageByUser(): Promise<Map<number, number>> {
  const rows = await prisma.item.groupBy({ by: ['owner_id'], where: { kind: 'FILE' }, _sum: { size: true } })
  return new Map(rows.map(row => [row.owner_id, Number(row._sum.size ?? 0)]))
}

/** Space promised to uploads still arriving. */
async function reservedBy(userId: number, db: Tx | typeof prisma = prisma, except?: string): Promise<number> {
  const { _sum } = await db.upload.aggregate({
    where: { owner_id: userId, ...(except ? { NOT: { id: except } } : {}) },
    _sum: { size: true },
  })
  return Number(_sum.size ?? 0)
}

/**
 * Refuse a file of `size` bytes that is over the upload limit or would not fit
 * in what is left of the owner's storage. `frees`: bytes it takes the place of,
 * as when a file is edited, so only the difference counts.
 */
export async function checkRoom(
  user: Pick<User, 'id' | 'quota_custom' | 'quota_bytes'>,
  size: number,
  options: { db?: Tx | typeof prisma; uploadId?: string; frees?: number } = {},
): Promise<void> {
  const db = options.db ?? prisma
  const settings = await getSettings(db)
  if (settings.maxUploadBytes !== null && size > settings.maxUploadBytes) throw new ApiError('fileTooLarge', 413)
  const quota = quotaOf(user, settings)
  if (quota === null) return
  const used = (await usageOf(user.id, db)) + (await reservedBy(user.id, db, options.uploadId))
  if (used + size - (options.frees ?? 0) > quota) throw new ApiError('quotaExceeded', 413)
}
