import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId, requiredText } from '@/lib/validate'
import { boardDetail } from '@/modules/tasks/lib/boards'
import { boardDto } from '@/modules/tasks/lib/dto'
import { ownBoard } from '@/modules/tasks/lib/scope'
import { TASKS_LIMITS, isValidOptionalText, optionalText } from '@/modules/tasks/lib/validate'

type Context = { params: Promise<{ id: string }> }

/** The board with its sections and tasks. */
export async function GET(_request: NextRequest, { params }: Context) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const board = id ? await boardDetail(user.id, id) : null
    if (!board) return apiError('notFound', 404)
    return NextResponse.json(board)
  })
}

/** A new title or description. */
export async function PUT(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)

    const data: { title?: string; description?: string | null } = {}
    if (body.title !== undefined) {
      const title = requiredText(body.title, TASKS_LIMITS.title)
      if (!title) return apiError('missingFields', 400)
      data.title = title
    }
    if ('description' in body) {
      if (!isValidOptionalText(body.description, TASKS_LIMITS.description)) return apiError('invalidInput', 400)
      data.description = optionalText(body.description, TASKS_LIMITS.description) ?? null
    }

    const { count } = await prisma.board.updateMany({ where: ownBoard(user.id, id), data })
    if (count === 0) return apiError('notFound', 404)
    const board = await prisma.board.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(boardDto(board))
  })
}

/** The board, with its sections and tasks. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.board.deleteMany({ where: ownBoard(user.id, id) })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ deleted: true })
  })
}
