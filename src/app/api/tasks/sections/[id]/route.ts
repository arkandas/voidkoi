import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId, requiredText } from '@/lib/validate'
import { sectionDto, taskDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownSection } from '@/modules/tasks/lib/scope'
import { TASKS_LIMITS, parseIndex } from '@/modules/tasks/lib/validate'

type Context = { params: Promise<{ id: string }> }

/** The section with its tasks. */
export async function GET(_request: NextRequest, { params }: Context) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const section = id
      ? await prisma.section.findFirst({
          where: ownSection(user.id, id),
          include: { tasks: { orderBy: ORDER } },
        })
      : null
    if (!section) return apiError('notFound', 404)
    return NextResponse.json({ ...sectionDto(section), tasks: section.tasks.map(taskDto) })
  })
}

/** A new title or position. */
export async function PUT(request: NextRequest, { params }: Context) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)

    const data: { title?: string; position?: number } = {}
    if (body.title !== undefined) {
      const title = requiredText(body.title, TASKS_LIMITS.title)
      if (!title) return apiError('missingFields', 400)
      data.title = title
    }
    if (body.position !== undefined) {
      const position = parseIndex(body.position)
      if (position === null) return apiError('invalidInput', 400)
      data.position = position
    }

    const { count } = await prisma.section.updateMany({ where: ownSection(user.id, id), data })
    if (count === 0) return apiError('notFound', 404)
    const section = await prisma.section.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(sectionDto(section))
  })
}

/** The section and its tasks. */
export async function DELETE(_request: NextRequest, { params }: Context) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.section.deleteMany({ where: ownSection(user.id, id) })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ deleted: true })
  })
}
