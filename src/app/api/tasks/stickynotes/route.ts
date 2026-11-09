import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { stickyNoteDto } from '@/modules/tasks/lib/dto'
import { readStickyChanges } from '@/modules/tasks/lib/sticky-input'

/** The sticky notes on the board, not the ones in the trash. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const notes = await prisma.stickyNote.findMany({
      where: { user_id: user.id, deleted_at: null },
      orderBy: { created_at: 'desc' },
    })
    return NextResponse.json(notes.map(stickyNoteDto))
  })
}

/** A new sticky note: `{ content?, color?, x?, y?, width?, height?, z? }`. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)
    const changes = readStickyChanges(body)
    if (!changes) return apiError('invalidInput', 400)
    const note = await prisma.stickyNote.create({ data: { content: '', ...changes, user_id: user.id } })
    return NextResponse.json(stickyNoteDto(note), { status: 201 })
  })
}
