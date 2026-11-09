/** The JSON the suite's own API speaks. Each app has its own types next to its code. */

import type { AppId } from '@/modules/types'

export type Role = 'ADMIN' | 'USER'

export interface PersonDto {
  id: number
  username: string
  /** The name others see. The username when null. */
  name: string | null
  /** Cache key of the profile picture, null for initials. */
  avatar: string | null
}

export interface MeDto {
  id: number
  username: string
  name: string | null
  email: string
  role: Role
  avatar: string | null
  authMode: 'local' | 'oidc'
  /** The apps this account uses, like "files", and the parts it leaves out, like "-tasks.stickies". Read with `uses()`. */
  apps: string[]
  /** False until the account has chosen its apps, which it does at its first sign-in. */
  appsChosen: boolean
  /** The language last used, for what the server writes on its own, like notifications. */
  locale: string | null
}

export interface AdminUser {
  id: number
  username: string
  name: string | null
  email: string
  role: Role
  avatar: string | null
  createdAt: string
  /** The apps this account uses. */
  apps: AppId[]
}
