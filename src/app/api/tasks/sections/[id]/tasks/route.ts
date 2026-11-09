import { NextRequest, NextResponse } from 'next/server'
import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { taskDto } from '@/modules/tasks/lib/dto'
import { ORDER, ownSection } from '@/modules/tasks/lib/scope'

/** The section's tasks, in order. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const section = id ? await prisma.section.findFirst({ where: ownSection(user.id, id), select: { id: true } }) : null
    if (!section) return apiError('notFound', 404)
    const tasks = await prisma.task.findMany({
      where: { section_id: section.id },
      orderBy: ORDER,
    })
    return NextResponse.json(tasks.map(taskDto))
  })
}
