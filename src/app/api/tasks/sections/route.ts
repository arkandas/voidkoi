import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId, requiredText } from '@/lib/validate'
import { sectionDto } from '@/modules/tasks/lib/dto'
import { ownBoard } from '@/modules/tasks/lib/scope'
import { MAX_SECTIONS, TASKS_LIMITS } from '@/modules/tasks/lib/validate'

/** A new section at the end of a board: `{ boardId, title }`. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const title = requiredText(body?.title, TASKS_LIMITS.title)
    if (!title) return apiError('missingFields', 400)
    const boardId = parseId(body?.boardId)
    if (!boardId) return apiError('notFound', 404)

    const board = await prisma.board.findFirst({
      where: ownBoard(user.id, boardId),
      select: { id: true, _count: { select: { sections: true } } },
    })
    if (!board) return apiError('notFound', 404)
    if (board._count.sections >= MAX_SECTIONS) return apiError('forbidden', 403)

    const last = await prisma.section.findFirst({
      where: { board_id: boardId },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const section = await prisma.section.create({
      data: { title, position: (last?.position ?? -1) + 1, board_id: boardId },
    })
    return NextResponse.json(sectionDto(section), { status: 201 })
  })
}
