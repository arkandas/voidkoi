import { prisma } from '@/lib/prisma'
import type { BoardDetail } from '@/modules/tasks/lib/api-types'
import { boardDto, sectionDto, taskDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownBoard } from '@/modules/tasks/lib/scope'

/** One of the account's boards with its sections and their tasks, in order. Null when it isn't theirs. */
export async function boardDetail(userId: number, id: number): Promise<BoardDetail | null> {
  const board = await prisma.board.findFirst({
    where: ownBoard(userId, id),
    include: {
      sections: {
        orderBy: ORDER,
        include: { tasks: { orderBy: ORDER } },
      },
    },
  })
  if (!board) return null
  return {
    ...boardDto(board),
    sections: board.sections.map(section => ({ ...sectionDto(section), tasks: section.tasks.map(taskDto) })),
  }
}

/** Just the title, for the page's name in the browser. */
export async function boardTitle(userId: number, id: number): Promise<string | null> {
  const board = await prisma.board.findFirst({ where: ownBoard(userId, id), select: { title: true } })
  return board?.title ?? null
}
