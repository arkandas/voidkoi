import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { stickyNoteDto } from '@/modules/tasks/lib/dto'
import { readStickyChanges } from '@/modules/tasks/lib/sticky-input'
import { TRASH_LIMIT } from '@/modules/tasks/lib/validate'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const note = id ? await prisma.stickyNote.findFirst({ where: { id, user_id: user.id } }) : null
    if (!note) return apiError('notFound', 404)
    return NextResponse.json(stickyNoteDto(note))
  })
}

/** Changes its text, colour, place, size or layer. */
export async function PUT(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const body = await readJson(request)
    const changes = body ? readStickyChanges(body) : null
    if (!changes) return apiError('invalidInput', 400)
    const { count } = await prisma.stickyNote.updateMany({ where: { id, user_id: user.id }, data: changes })
    if (count === 0) return apiError('notFound', 404)
    const note = await prisma.stickyNote.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(stickyNoteDto(note))
  })
}

/** To the trash, which keeps the most recent ones and lets older ones go. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.stickyNote.updateMany({ where: { id, user_id: user.id }, data: { deleted_at: new Date() } })
    if (count === 0) return apiError('notFound', 404)

    const overflow = await prisma.stickyNote.findMany({
      where: { user_id: user.id, deleted_at: { not: null } },
      orderBy: [{ deleted_at: 'desc' }, { id: 'desc' }],
      skip: TRASH_LIMIT,
      select: { id: true },
    })
    if (overflow.length > 0) {
      await prisma.stickyNote.deleteMany({ where: { id: { in: overflow.map(note => note.id) }, user_id: user.id } })
    }
    return NextResponse.json({ trashed: true })
  })
}
