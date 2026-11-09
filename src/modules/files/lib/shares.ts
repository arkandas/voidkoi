import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Item, ShareLink, UploadLink, User } from '@/generated/prisma/client'
import type { LinkAccessDto, LinkDto, ShareInfo, SharedItem, SharedWithMeItem, UploadLinkDto } from '@/modules/files/lib/api-types'
import { baseCookieOptions } from '@/lib/auth-cookies'
import { ApiError } from '@/lib/error-codes'
import { newToken } from '@/lib/ids'
import { describe, folderSize, locationOf, toPerson } from '@/modules/files/lib/items'
import { prisma } from '@/lib/prisma'
import { getSettings } from '@/modules/files/lib/settings'

export function toLinkDto(link: ShareLink): LinkDto {
  return {
    token: link.token,
    access: link.access === 'PUBLIC' ? 'public' : 'users',
    hasPassword: link.password_hash !== null,
    expiresAt: link.expires_at?.toISOString() ?? null,
    maxDownloads: link.max_downloads,
    downloads: link.download_count,
    createdAt: link.created_at.toISOString(),
  }
}

/** An upload link for its owner, with how full its folder is. */
export async function toUploadLinkDto(link: UploadLink, folderLimit: number | null): Promise<UploadLinkDto> {
  return {
    token: link.token,
    hasPassword: link.password_hash !== null,
    expiresAt: link.expires_at?.toISOString() ?? null,
    received: link.received_count,
    createdAt: link.created_at.toISOString(),
    folderSize: await folderSize(prisma, link.folder_id),
    folderLimit,
  }
}

export async function shareInfo(itemId: number): Promise<ShareInfo> {
  const [link, uploadLink, shares, settings] = await Promise.all([
    prisma.shareLink.findUnique({ where: { item_id: itemId } }),
    prisma.uploadLink.findUnique({ where: { folder_id: itemId } }),
    prisma.share.findMany({ where: { item_id: itemId }, include: { user: true }, orderBy: { created_at: 'asc' } }),
    getSettings(),
  ])
  return {
    link: link ? toLinkDto(link) : null,
    uploadLink: uploadLink ? await toUploadLinkDto(uploadLink, settings.uploadLinkMaxBytes) : null,
    people: shares.map(share => toPerson(share.user)),
  }
}

export interface LinkInput {
  access: LinkAccessDto
  /** Undefined keeps the current password, null removes it. */
  password: string | null | undefined
  expiresAt: Date | null
  maxDownloads: number | null
}

/** Create the item's link, or change how it works. The address stays the same. */
export async function saveLink(owner: User, item: Item, input: LinkInput): Promise<ShareLink> {
  const existing = await prisma.shareLink.findUnique({ where: { item_id: item.id } })
  const password_hash = input.password === undefined
    ? existing?.password_hash ?? null
    : input.password === null ? null : await bcrypt.hash(input.password, 10)
  const data = {
    access: input.access === 'public' ? ('PUBLIC' as const) : ('USERS' as const),
    password_hash,
    expires_at: input.expiresAt,
    max_downloads: input.maxDownloads,
  }
  if (existing) return prisma.shareLink.update({ where: { id: existing.id }, data })
  return prisma.shareLink.create({ data: { ...data, token: newToken(), item_id: item.id, owner_id: owner.id } })
}

export async function deleteLink(itemId: number): Promise<void> {
  await prisma.shareLink.deleteMany({ where: { item_id: itemId } })
}

/** Share with exactly these people, replacing whoever it was shared with before. */
export async function setPeople(owner: User, item: Item, userIds: number[]): Promise<void> {
  if (userIds.includes(owner.id)) throw new ApiError('invalidPeople', 400)
  const found = await prisma.user.count({ where: { id: { in: userIds } } })
  if (found !== userIds.length) throw new ApiError('invalidPeople', 400)
  await prisma.$transaction([
    prisma.share.deleteMany({ where: { item_id: item.id, user_id: { notIn: userIds } } }),
    prisma.share.createMany({
      data: userIds.map(user_id => ({ item_id: item.id, owner_id: owner.id, user_id })),
      skipDuplicates: true,
    }),
  ])
}

export async function myShares(ownerId: number): Promise<SharedItem[]> {
  const items = await prisma.item.findMany({
    where: {
      owner_id: ownerId,
      trashed_at: null,
      OR: [{ link: { isNot: null } }, { upload_link: { isNot: null } }, { shares: { some: {} } }],
    },
    include: { link: true, upload_link: true, shares: { include: { user: true }, orderBy: { created_at: 'asc' } } },
    orderBy: { updated_at: 'desc' },
  })
  const [described, settings] = await Promise.all([describe(items, true, ownerId), getSettings()])
  return Promise.all(
    items.map(async (item, index) => ({
      item: described[index]!,
      link: item.link ? toLinkDto(item.link) : null,
      uploadLink: item.upload_link ? await toUploadLinkDto(item.upload_link, settings.uploadLinkMaxBytes) : null,
      people: item.shares.map(share => toPerson(share.user)),
      location: await locationOf(item),
    })),
  )
}

export async function sharedWithMe(userId: number): Promise<SharedWithMeItem[]> {
  const shares = await prisma.share.findMany({
    where: { user_id: userId, item: { trashed_at: null } },
    include: { item: true, owner: true },
    orderBy: { created_at: 'desc' },
  })
  const described = await describe(shares.map(share => share.item), false, userId)
  return shares.map((share, index) => ({
    item: described[index]!,
    owner: toPerson(share.owner),
    sharedAt: share.created_at.toISOString(),
  }))
}

export async function leaveShare(userId: number, itemId: number): Promise<void> {
  const { count } = await prisma.share.deleteMany({ where: { user_id: userId, item_id: itemId } })
  if (count === 0) throw new ApiError('notFound', 404)
}

/* Opening a link ------------------------------------------------------ */

export type LinkWithItem = ShareLink & { item: Item; owner: User }

export async function findLink(token: string): Promise<LinkWithItem | null> {
  return prisma.shareLink.findUnique({ where: { token }, include: { item: true, owner: true } })
}

/** Whether a link still works, whoever opens it. */
export function linkState(link: LinkWithItem | null, now = new Date()): 'ok' | 'notFound' | 'expired' | 'usedUp' {
  if (!link || link.item.trashed_at) return 'notFound'
  if (link.expires_at && link.expires_at <= now) return 'expired'
  if (link.max_downloads !== null && link.download_count >= link.max_downloads) return 'usedUp'
  return 'ok'
}

const secret = () => process.env.VOIDKOI_NEXTAUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''

/** What a password cookie opens: a share link, or an upload link. Neither one's cookie opens the other. */
export type LinkKind = 'link' | 'upload'

type Locked = Pick<ShareLink, 'token' | 'password_hash'>

/** One cookie per link, named without giving the link away. */
export function unlockCookieName(token: string, kind: LinkKind = 'link'): string {
  const prefix = baseCookieOptions.secure ? '__Secure-' : ''
  return `${prefix}files.${kind}-${createHash('sha256').update(token).digest('base64url').slice(0, 16)}`
}

/** Proof that whoever holds it typed this link's password. Changing the password voids it. */
export function unlockValue(link: Locked, kind: LinkKind = 'link'): string {
  return createHmac('sha256', secret()).update(`${kind}:${link.token}:${link.password_hash ?? ''}`).digest('base64url')
}

export function isUnlocked(link: Locked, cookie: string | undefined, kind: LinkKind = 'link'): boolean {
  if (!link.password_hash) return true
  if (!cookie) return false
  const expected = Buffer.from(unlockValue(link, kind))
  const given = Buffer.from(cookie)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

/** What stands between this visitor and the link: nothing, signing in, or the password. */
export function gate(
  link: LinkWithItem,
  visitor: { signedIn: boolean; cookie: string | undefined },
): 'ok' | 'signIn' | 'password' {
  if (link.access === 'USERS' && !visitor.signedIn) return 'signIn'
  if (!isUnlocked(link, visitor.cookie)) return 'password'
  return 'ok'
}

export async function checkLinkPassword(link: Pick<ShareLink, 'password_hash'>, password: string): Promise<boolean> {
  return link.password_hash !== null && bcrypt.compare(password, link.password_hash)
}

/** Count a download, unless the link has run out. Safe against two downloads at once. */
export async function countDownload(linkId: number): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE files_share_links SET download_count = download_count + 1
    WHERE id = ${linkId} AND (max_downloads IS NULL OR download_count < max_downloads)`
  return updated === 1
}
