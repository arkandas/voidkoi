import bcrypt from 'bcryptjs'
import type { Prisma, User } from '@/generated/prisma/client'
import type { AdminUser, MeDto, PersonDto } from '@/lib/api-types'
import { authConfig } from '@/lib/auth-config'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'
import { removeFrom } from '@/lib/storage'
import { cleanAppKeys, isAppId } from '@/modules/registry'
import { SERVERS } from '@/modules/servers'

export function describeMe(user: User): MeDto {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar_key,
    authMode: authConfig.mode,
    apps: cleanAppKeys(user.apps),
    appsChosen: user.apps_chosen_at !== null,
    locale: user.locale,
  }
}

export function toPerson(user: Pick<User, 'id' | 'username' | 'name' | 'avatar_key'>): PersonDto {
  return { id: user.id, username: user.username, name: user.name, avatar: user.avatar_key }
}

export function toAdminUser(user: User): AdminUser {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar: user.avatar_key,
    createdAt: user.created_at.toISOString(),
    apps: user.apps.filter(isAppId),
  }
}

/** Held while an account is made, so the check for the first account and the insert can't interleave. */
const ACCOUNTS_LOCK = 7_301_001

/**
 * A new account. The suite's first account is its admin. After that, an
 * account is only made when `allowedAfterFirst` (an admin is adding it, or the
 * sign-in provider vouches for the person), with `role`. The count and the
 * insert happen under one lock, so two first sign-ins at once can't both
 * become admin, and nobody slips in on a fresh instance's open door.
 */
export async function createAccountRow(
  data: Omit<Prisma.UserCreateInput, 'role'>,
  { role = 'USER', allowedAfterFirst }: { role?: 'ADMIN' | 'USER'; allowedAfterFirst: boolean },
): Promise<User> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ACCOUNTS_LOCK})`
    const first = (await tx.user.count()) === 0
    if (!first && !allowedAfterFirst) throw new ApiError('unauthorized', 401)
    return tx.user.create({ data: { ...data, role: first ? 'ADMIN' : role } })
  })
}

export async function listAccounts(): Promise<AdminUser[]> {
  const users = await prisma.user.findMany({ orderBy: { created_at: 'asc' } })
  return users.map(toAdminUser)
}

/** A new password, which ends every session signed in with an older one. */
export async function setPassword(userId: number, password: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { password: await bcrypt.hash(password, 10), session_version: { increment: 1 } },
  })
}

/** Delete an account with everything it kept: each app's files are gathered first, the rows go, then the files. */
export async function deleteAccount(adminId: number, userId: number): Promise<void> {
  if (adminId === userId) throw new ApiError('cannotDeleteSelf', 400)
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) throw new ApiError('userNotFound', 404)
  const removals = await Promise.all(
    Object.values(SERVERS).map(server => server.collectAccountFiles?.(userId) ?? Promise.resolve(async () => {})),
  )
  await prisma.user.delete({ where: { id: userId } })
  for (const remove of removals) await remove().catch(() => {})
  if (user.avatar_key) await removeFrom('avatars', user.avatar_key).catch(() => {})
}
