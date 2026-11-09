import { cookies } from 'next/headers'
import type { Item } from '@/generated/prisma/client'
import { isToken } from '@/lib/ids'
import { isWithin } from '@/modules/files/lib/items'
import { prisma } from '@/lib/prisma'
import { currentUser } from '@/lib/session'
import { findLink, gate, linkState, unlockCookieName, type LinkWithItem } from '@/modules/files/lib/shares'

export type Refusal = 'notFound' | 'expired' | 'usedUp' | 'signIn' | 'password'

/** A link as this visitor may use it right now, or why they can't. */
export async function openLink(token: string): Promise<{ link: LinkWithItem } | { refusal: Refusal; link: LinkWithItem | null }> {
  const link = isToken(token) ? await findLink(token) : null
  const state = linkState(link)
  if (state !== 'ok') return { refusal: state, link }
  const cookie = (await cookies()).get(unlockCookieName(token))?.value
  const passage = gate(link!, { signedIn: (await currentUser()) !== null, cookie })
  return passage === 'ok' ? { link: link! } : { refusal: passage, link }
}

/** An item reachable through the link: the shared item itself, or anything inside a shared folder. */
export async function itemInLink(link: LinkWithItem, itemId: number | null): Promise<Item | null> {
  if (itemId === null || itemId === link.item_id) return link.item
  const item = await prisma.item.findUnique({ where: { id: itemId } })
  if (!item || item.trashed_at || item.owner_id !== link.owner_id) return null
  return (await isWithin(link.item_id, item.id)) ? item : null
}

export const REFUSAL_STATUS: Record<Refusal, number> = {
  notFound: 404,
  expired: 410,
  usedUp: 410,
  signIn: 401,
  password: 403,
}
