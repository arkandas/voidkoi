import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { taskDto } from '@/modules/tasks/lib/dto'
import { ownTask } from '@/modules/tasks/lib/scope'
import { readItemChanges } from '@/modules/tasks/lib/task-input'

type Context = { params: Promise<{ id: string }> }

export async function GET(_request: NextRequest, { params }: Context) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const task = id ? await prisma.task.findFirst({ where: ownTask(user.id, id) }) : null
    if (!task) return apiError('notFound', 404)
    return NextResponse.json(taskDto(task))
  })
}

/** Changes any of title, description, priority, deadline, completed and position. */
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

    const { count } = await prisma.task.updateMany({ where: ownTask(user.id, id), data: changes })
    if (count === 0) return apiError('notFound', 404)
    const task = await prisma.task.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(taskDto(task))
  })
}

/** Delete the task. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.task.deleteMany({ where: ownTask(user.id, id) })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ deleted: true })
  })
}
