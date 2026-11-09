import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { cache } from 'react'
import bcrypt from 'bcryptjs'
import type { WikiSettings as Settings, User } from '@/generated/prisma/client'
import { baseCookieOptions } from '@/lib/auth-cookies'
import { prisma, type Tx } from '@/lib/prisma'
import { currentUser } from '@/lib/session'
import { isEditor, isMember } from '@/modules/wiki/lib/access'
import { getSettings, rootVisibility } from '@/modules/wiki/lib/settings'
import { buildIndex, NODE_SELECT, type Lock, type Reader, type WikiIndex } from '@/modules/wiki/lib/tree'

const secret = () => process.env.VOIDKOI_NEXTAUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? ''

/** A week: how long a typed password keeps its pages open in this browser. */
export const UNLOCK_SECONDS = 7 * 24 * 60 * 60

/** One cookie per lock. Its number isn't secret: the value is what proves the password was typed. */
export function unlockCookieName(lockId: number): string {
  return `${baseCookieOptions.secure ? '__Secure-' : ''}wiki.unlock-${lockId}`
}

function sign(lock: Pick<Lock, 'lockId' | 'hash'>, expires: number): string {
  return createHmac('sha256', secret()).update(`unlock:${lock.lockId}:${lock.hash ?? ''}:${expires}`).digest('base64url')
}

/**
 * Proof that this browser typed a lock's password: when it runs out, and a
 * signature over that and the password's hash. A new password, or the week
 * passing, makes it worthless, whatever the browser keeps.
 */
export function unlockValue(lock: Pick<Lock, 'lockId' | 'hash'>, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + UNLOCK_SECONDS
  return `${expires}.${sign(lock, expires)}`
}

export function isUnlockedBy(cookie: string | undefined, lock: Pick<Lock, 'lockId' | 'hash'>, now = Date.now()): boolean {
  if (!cookie) return false
  const [expiresText, signature] = cookie.split('.')
  const expires = Number(expiresText)
  if (!Number.isSafeInteger(expires) || expires * 1000 <= now || !signature) return false
  return matches(signature, sign(lock, expires))
}

export function matches(given: string | undefined, expected: string): boolean {
  if (!given) return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function rootLock(settings: Settings): Lock {
  const visibility = rootVisibility(settings)
  if (visibility === 'password' && !settings.root_password_hash) return { visibility: 'private', lockId: 0, hash: null }
  return { visibility, lockId: 0, hash: visibility === 'password' ? settings.root_password_hash : null }
}

export interface WikiContext {
  /** The account reading, when it uses the wiki. Anyone else reads as a visitor. */
  user: User | null
  /** Whether someone is signed in at all, using the wiki or not. */
  signedIn: boolean
  settings: Settings
  index: WikiIndex
  reader: Reader
}

export async function loadIndex(settings: Settings, db: Tx | typeof prisma = prisma): Promise<WikiIndex> {
  const nodes = await db.wikiNode.findMany({ where: { deleted_at: null }, select: NODE_SELECT })
  return buildIndex(nodes, rootLock(settings))
}

/** Everything a request needs to know about the wiki and who is reading it. Loaded once per request. */
export const wikiContext = cache(async (): Promise<WikiContext> => {
  const [account, settings, jar] = await Promise.all([currentUser(), getSettings(), cookies()])
  const user = isMember(account) ? account : null
  const [index, editor] = await Promise.all([loadIndex(settings), isEditor(user)])
  const reader: Reader = {
    editor,
    signedIn: user !== null,
    unlocked: lock => lock.hash !== null && isUnlockedBy(jar.get(unlockCookieName(lock.lockId))?.value, lock),
  }
  return { user, signedIn: account !== null, settings, index, reader }
})

/** The password that opens a lock: the node's own, or the wiki's for lock 0. */
export async function checkLockPassword(lock: Lock, password: string): Promise<boolean> {
  return lock.visibility === 'password' && lock.hash !== null && bcrypt.compare(password, lock.hash)
}
