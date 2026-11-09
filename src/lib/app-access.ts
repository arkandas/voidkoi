import { redirect } from 'next/navigation'
import type { User } from '@/generated/prisma/client'
import { currentUser } from '@/lib/session'
import { uses, type AppId } from '@/modules/registry'

/** A page of the suite: signed in, with apps chosen. Otherwise to the sign-in or to choosing apps. */
export async function requireSuitePage(): Promise<User> {
  const user = await currentUser()
  if (!user) redirect('/login')
  if (!user.apps_chosen_at) redirect('/welcome')
  return user
}

/** A page of an app the account uses, or of a part of it. Otherwise home, which opens one it does use. */
export async function requireAppPage(app: AppId, subApp?: string): Promise<User> {
  const user = await requireSuitePage()
  if (!uses(user.apps, app, subApp)) redirect('/')
  return user
}
