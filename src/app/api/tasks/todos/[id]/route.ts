import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { todoDto } from '@/modules/tasks/lib/dto'
import { readItemChanges } from '@/modules/tasks/lib/task-input'
import { moveItem } from '@/modules/tasks/lib/validate'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const todo = id ? await prisma.todoItem.findFirst({ where: { id, user_id: user.id } }) : null
    if (!todo) return apiError('notFound', 404)
    return NextResponse.json(todoDto(todo))
  })
}

/**
 * Changes any of title, description, priority, deadline and completed. A
 * `position` moves the item to that place in the whole list, as it is shown.
 */
export async function PUT(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)
    const changes = readItemChanges(body)
    if (changes === 'title') return apiError('missingFields', 400)
    if (changes === 'invalid') return apiError('invalidInput', 400)
    const { position, ...fields } = changes

    const owned = await prisma.todoItem.findFirst({ where: { id, user_id: user.id }, select: { id: true } })
    if (!owned) return apiError('notFound', 404)

    if (position !== undefined) {
      const todos = await prisma.todoItem.findMany({
        where: { user_id: user.id },
        orderBy: [{ completed: 'asc' }, { position: 'asc' }, { created_at: 'desc' }],
        select: { id: true },
      })
      const reordered = moveItem(todos, todos.findIndex(todo => todo.id === id), position)
      await prisma.$transaction(
        reordered.map((todo, index) => prisma.todoItem.update({ where: { id: todo.id }, data: { position: index } })),
      )
    }

    const todo = await prisma.todoItem.update({ where: { id }, data: fields })
    return NextResponse.json(todoDto(todo))
  })
}

export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.todoItem.deleteMany({ where: { id, user_id: user.id } })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ deleted: true })
  })
}
