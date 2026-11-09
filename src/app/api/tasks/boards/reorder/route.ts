import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { ORDER, ownBoard } from '@/modules/tasks/lib/scope'
import { moveItem, parseIndex } from '@/modules/tasks/lib/validate'

/** Moves a board to another place in the list: `{ boardId, position }`. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const boardId = parseId(body?.boardId)
    const position = parseIndex(body?.position)
    if (!boardId || position === null) return apiError('invalidInput', 400)

    const boards = await prisma.board.findMany({ where: ownBoard(user.id), orderBy: ORDER, select: { id: true } })
    const from = boards.findIndex(board => board.id === boardId)
    if (from === -1) return apiError('notFound', 404)

    const reordered = moveItem(boards, from, position)
    await prisma.$transaction(
      reordered.map((board, index) => prisma.board.update({ where: { id: board.id }, data: { position: index } })),
    )
    return NextResponse.json({ moved: true })
  })
}
