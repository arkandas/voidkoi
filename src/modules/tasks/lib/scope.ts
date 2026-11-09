import type { Prisma } from '@/generated/prisma/client'

/**
 * Where-clauses that keep every query to the signed-in account's own rows:
 * a board is its own, and a section or task is in one of its boards.
 */

export const ORDER = [{ position: 'asc' as const }, { id: 'asc' as const }]

export function ownBoard(userId: number, id?: number): Prisma.BoardWhereInput {
  return id === undefined ? { user_id: userId } : { id, user_id: userId }
}

export function ownSection(userId: number, id?: number): Prisma.SectionWhereInput {
  return { ...(id === undefined ? {} : { id }), board: { user_id: userId } }
}

export function ownTask(userId: number, id?: number): Prisma.TaskWhereInput {
  return { ...(id === undefined ? {} : { id }), section: { board: { user_id: userId } } }
}
