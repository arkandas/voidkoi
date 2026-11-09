import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { requiredText } from '@/lib/validate'
import { boardDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownBoard } from '@/modules/tasks/lib/scope'
import { TASKS_LIMITS, isValidOptionalText, optionalText } from '@/modules/tasks/lib/validate'

/** The account's boards, in its order. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const boards = await prisma.board.findMany({ where: ownBoard(user.id), orderBy: ORDER })
    return NextResponse.json(boards.map(boardDto))
  })
}

/** A new board, last in the list. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const title = requiredText(body?.title, TASKS_LIMITS.title)
    if (!title) return apiError('missingFields', 400)
    if (!isValidOptionalText(body?.description, TASKS_LIMITS.description)) return apiError('invalidInput', 400)

    const last = await prisma.board.findFirst({
      where: ownBoard(user.id),
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const board = await prisma.board.create({
      data: {
        title,
        description: optionalText(body?.description, TASKS_LIMITS.description) ?? null,
        position: (last?.position ?? -1) + 1,
        user_id: user.id,
      },
    })
    return NextResponse.json(boardDto(board), { status: 201 })
  })
}
