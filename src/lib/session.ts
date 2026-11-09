import { getServerSession } from 'next-auth'
import type { User } from '@/generated/prisma/client'
import { authOptions } from '@/lib/auth'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'

/**
 * The signed-in account, read from the database so a deleted user loses
 * access at once. A session from before the password last changed is over.
 */
export async function currentUser(): Promise<User | null> {
  const session = await getServerSession(authOptions)
  const id = Number(session?.user?.id)
  if (!Number.isInteger(id)) return null
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user || (session?.user?.sv ?? 0) !== user.session_version) return null
  return user
}

export async function requireUser(): Promise<User> {
  const user = await currentUser()
  if (!user) throw new ApiError('unauthorized', 401)
  return user
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser()
  if (user.role !== 'ADMIN') throw new ApiError('forbidden', 403)
  return user
}
