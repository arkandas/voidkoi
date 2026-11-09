import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import type { Item, UploadLink, User } from '@/generated/prisma/client'
import { ApiError, type ApiErrorCode } from '@/lib/error-codes'
import { isToken, newToken } from '@/lib/ids'
import { prisma } from '@/lib/prisma'
import { isUnlocked, unlockCookieName } from '@/modules/files/lib/shares'
import type { ViaLink } from '@/modules/files/lib/uploads'

/**
 * Upload links: people without an account put files in a folder through
 * one, and never see what is in it. The files are its owner's, and count
 * toward their storage.
 */

export type UploadLinkWith = UploadLink & { folder: Item; owner: User }

export interface UploadLinkInput {
  /** Undefined keeps the current password, null removes it. */
  password: string | null | undefined
  expiresAt: Date | null
}

/** Create the folder's upload link, or change it. The address stays the same. */
export async function saveUploadLink(owner: User, folder: Item, input: UploadLinkInput): Promise<UploadLink> {
  if (folder.kind !== 'FOLDER') throw new ApiError('invalidInput', 400)
  const existing = await prisma.uploadLink.findUnique({ where: { folder_id: folder.id } })
  const password_hash = input.password === undefined
    ? existing?.password_hash ?? null
    : input.password === null ? null : await bcrypt.hash(input.password, 10)
  const data = { password_hash, expires_at: input.expiresAt }
  if (existing) return prisma.uploadLink.update({ where: { id: existing.id }, data })
  return prisma.uploadLink.create({ data: { ...data, token: newToken(), folder_id: folder.id, owner_id: owner.id } })
}

export async function deleteUploadLink(folderId: number): Promise<void> {
  await prisma.uploadLink.deleteMany({ where: { folder_id: folderId } })
}

export async function findUploadLink(token: string): Promise<UploadLinkWith | null> {
  if (!isToken(token)) return null
  return prisma.uploadLink.findUnique({ where: { token }, include: { folder: true, owner: true } })
}

/** Whether an upload link still takes files, whoever opens it. A folder in the trash takes none. */
export function uploadLinkState(link: Pick<UploadLinkWith, 'expires_at' | 'folder'> | null, now = new Date()): 'ok' | 'notFound' | 'expired' {
  if (!link || link.folder.trashed_at) return 'notFound'
  if (link.expires_at && link.expires_at <= now) return 'expired'
  return 'ok'
}

export type UploadRefusal = 'notFound' | 'expired' | 'password'

/** An upload link as this visitor may use it right now, or why they can't. */
export async function openUploadLink(
  token: string,
): Promise<{ link: UploadLinkWith } | { refusal: UploadRefusal; link: UploadLinkWith | null }> {
  const link = await findUploadLink(token)
  const state = uploadLinkState(link)
  if (state !== 'ok') return { refusal: state, link }
  const cookie = (await cookies()).get(unlockCookieName(token, 'upload'))?.value
  return isUnlocked(link!, cookie, 'upload') ? { link: link! } : { refusal: 'password', link }
}

const REFUSALS: Record<UploadRefusal, [ApiErrorCode, number]> = {
  notFound: ['linkNotFound', 404],
  expired: ['linkExpired', 410],
  password: ['passwordRequired', 403],
}

/** The link files are coming through, for a route that takes them. One that can't take any throws. */
export async function requireUploadLink(token: string): Promise<UploadLinkWith> {
  const opened = await openUploadLink(token)
  if ('refusal' in opened) throw new ApiError(...REFUSALS[opened.refusal])
  return opened.link
}

/** What an upload through the link is held to: its folder, and the link's count. */
export function viaOf(link: UploadLink): ViaLink {
  return { id: link.id, folderId: link.folder_id }
}
