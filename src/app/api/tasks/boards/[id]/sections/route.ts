import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { sectionDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownBoard } from '@/modules/tasks/lib/scope'

/** The board's sections, in order. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const board = id ? await prisma.board.findFirst({ where: ownBoard(user.id, id), select: { id: true } }) : null
    if (!board) return apiError('notFound', 404)
    const sections = await prisma.section.findMany({ where: { board_id: board.id }, orderBy: ORDER })
    return NextResponse.json(sections.map(sectionDto))
  })
}
