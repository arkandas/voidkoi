import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { stickyNoteDto } from '@/modules/tasks/lib/dto'

/** Back from the trash, where it was. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('restoreFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.stickyNote.updateMany({ where: { id, user_id: user.id }, data: { deleted_at: null } })
    if (count === 0) return apiError('notFound', 404)
    const note = await prisma.stickyNote.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(stickyNoteDto(note))
  })
}
