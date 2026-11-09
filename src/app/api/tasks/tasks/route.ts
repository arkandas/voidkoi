import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { taskDto } from '@/modules/tasks/lib/dto'
import { ownSection } from '@/modules/tasks/lib/scope'
import { readItemChanges } from '@/modules/tasks/lib/task-input'

/** A new task at the end of a section: `{ sectionId, title, description?, priority?, deadline? }`. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    if (!body) return apiError('invalidInput', 400)
    const changes = readItemChanges({ ...body, title: body.title ?? '', completed: undefined, position: undefined })
    if (changes === 'title') return apiError('missingFields', 400)
    if (changes === 'invalid') return apiError('invalidInput', 400)

    const sectionId = parseId(body.sectionId)
    const section = sectionId
      ? await prisma.section.findFirst({ where: ownSection(user.id, sectionId), select: { id: true } })
      : null
    if (!section) return apiError('notFound', 404)

    const last = await prisma.task.findFirst({
      where: { section_id: section.id },
      orderBy: { position: 'desc' },
      select: { position: true },
    })
    const task = await prisma.task.create({
      data: {
        title: changes.title!,
        description: changes.description ?? null,
        priority: changes.priority ?? 'MEDIUM',
        deadline: changes.deadline ?? null,
        position: (last?.position ?? -1) + 1,
        section_id: section.id,
      },
    })
    return NextResponse.json(taskDto(task), { status: 201 })
  })
}
