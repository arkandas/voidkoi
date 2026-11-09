import type { User } from '@/generated/prisma/client'
import { ApiError } from '@/lib/error-codes'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { uses } from '@/modules/registry'

/** Whether an account reads the wiki as a member: it uses the app. Anyone else reads what is public. */
export function isMember(user: Pick<User, 'apps'> | null): boolean {
  return user !== null && uses(user.apps, 'wiki')
}

/** Whether a member may write: an admin, or an account an admin made an editor. */
export async function isEditor(user: Pick<User, 'id' | 'role' | 'apps'> | null): Promise<boolean> {
  if (!user || !isMember(user)) return false
  if (user.role === 'ADMIN') return true
  return (await prisma.wikiEditor.findUnique({ where: { user_id: user.id }, select: { user_id: true } })) !== null
}

/** The signed-in account, when it may write in the wiki. */
export async function requireEditor(): Promise<User> {
  const user = await requireUser()
  if (!(await isEditor(user))) throw new ApiError('forbidden', 403)
  return user
}
