import type { FavoriteEntry } from '@/modules/files/lib/api-types'
import { accessTo, describe, locationOf, toPerson, visibleItem } from '@/modules/files/lib/items'
import { prisma } from '@/lib/prisma'

/** Star something you can see: your own, or something shared with you. */
export async function addFavorite(userId: number, itemId: number | null): Promise<void> {
  const { item } = await visibleItem(userId, itemId)
  await prisma.favorite.createMany({ data: [{ user_id: userId, item_id: item.id }], skipDuplicates: true })
}

export async function removeFavorite(userId: number, itemId: number): Promise<void> {
  await prisma.favorite.deleteMany({ where: { user_id: userId, item_id: itemId } })
}

/**
 * What someone starred and can still open: nothing in the trash, and
 * somebody else's only while it is still shared with them.
 */
export async function listFavorites(userId: number): Promise<FavoriteEntry[]> {
  const rows = await prisma.favorite.findMany({
    where: { user_id: userId, item: { trashed_at: null } },
    include: { item: { include: { owner: true } } },
  })
  const own = rows.filter(row => row.item.owner_id === userId).map(row => row.item)
  const shared = []
  for (const row of rows) {
    if (row.item.owner_id !== userId && (await accessTo(userId, row.item_id))) shared.push(row.item)
  }

  const [ownDtos, sharedDtos] = await Promise.all([describe(own, true, userId), describe(shared, false, userId)])
  const mine = await Promise.all(
    own.map(async (item, index) => ({ item: ownDtos[index]!, owner: null, location: await locationOf(item) })),
  )
  const theirs = shared.map((item, index) => ({ item: sharedDtos[index]!, owner: toPerson(item.owner), location: '' }))
  return [...mine, ...theirs]
}
