import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { todoDto } from '@/modules/tasks/lib/dto'
import { readItemChanges } from '@/modules/tasks/lib/task-input'

/** The to-do list: what is left first, in its order, then what is done. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const todos = await prisma.todoItem.findMany({
      where: { user_id: user.id },
      orderBy: [{ completed: 'asc' }, { position: 'asc' }, { created_at: 'desc' }],
    })
    return NextResponse.json(todos.map(todoDto))
  })
}

/** A new item at the top of the list: `{ title, description?, priority?, deadline? }`. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)
    const changes = readItemChanges({ ...body, title: body.title ?? '', completed: undefined, position: undefined })
    if (changes === 'title') return apiError('missingFields', 400)
    if (changes === 'invalid') return apiError('invalidInput', 400)

    const first = await prisma.todoItem.findFirst({
      where: { user_id: user.id },
      orderBy: { position: 'asc' },
      select: { position: true },
    })
    const todo = await prisma.todoItem.create({
      data: {
        title: changes.title!,
        description: changes.description ?? null,
        priority: changes.priority ?? 'MEDIUM',
        deadline: changes.deadline ?? null,
        position: (first?.position ?? 1) - 1,
        user_id: user.id,
      },
    })
    return NextResponse.json(todoDto(todo), { status: 201 })
  })
}
