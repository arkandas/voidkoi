import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { taskDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownSection, ownTask } from '@/modules/tasks/lib/scope'
import { parseIndex } from '@/modules/tasks/lib/validate'

/**
 * Moves a task to a place in a section, the same one or another of the
 * account's: `{ sectionId, position }`. Both sections are numbered again.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const body = await readJson(request)
    const sectionId = parseId(body?.sectionId)
    const position = parseIndex(body?.position)
    if (!sectionId || position === null) return apiError('invalidInput', 400)

    const [task, target] = await Promise.all([
      prisma.task.findFirst({ where: ownTask(user.id, id), select: { id: true, section_id: true } }),
      prisma.section.findFirst({ where: ownSection(user.id, sectionId), select: { id: true } }),
    ])
    if (!task || !target) return apiError('notFound', 404)

    const targetIds = (
      await prisma.task.findMany({ where: { section_id: sectionId, id: { not: id } }, orderBy: ORDER, select: { id: true } })
    ).map(other => other.id)
    targetIds.splice(Math.min(position, targetIds.length), 0, id)

    const sourceIds =
      task.section_id === sectionId
        ? []
        : (
            await prisma.task.findMany({
              where: { section_id: task.section_id, id: { not: id } },
              orderBy: ORDER,
              select: { id: true },
            })
          ).map(other => other.id)

    await prisma.$transaction([
      ...targetIds.map((taskId, index) =>
        prisma.task.update({
          where: { id: taskId },
          data: taskId === id ? { position: index, section_id: sectionId } : { position: index },
        }),
      ),
      ...sourceIds.map((taskId, index) => prisma.task.update({ where: { id: taskId }, data: { position: index } })),
    ])

    const moved = await prisma.task.findUniqueOrThrow({ where: { id } })
    return NextResponse.json(taskDto(moved))
  })
}
