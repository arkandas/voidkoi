import { NextResponse } from 'next/server'
import { handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { stickyNoteDto } from '@/modules/tasks/lib/dto'
import { TRASH_LIMIT } from '@/modules/tasks/lib/validate'

/** What is in the trash, the most recently deleted first. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const notes = await prisma.stickyNote.findMany({
      where: { user_id: user.id, deleted_at: { not: null } },
      orderBy: [{ deleted_at: 'desc' }, { id: 'desc' }],
      take: TRASH_LIMIT,
    })
    return NextResponse.json(notes.map(stickyNoteDto))
  })
}

/** Empties the trash for good. */
export async function DELETE() {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const { count } = await prisma.stickyNote.deleteMany({ where: { user_id: user.id, deleted_at: { not: null } } })
    return NextResponse.json({ deleted: count })
  })
}
