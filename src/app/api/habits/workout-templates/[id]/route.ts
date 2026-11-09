import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { isUniqueViolation, readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { readWorkoutTemplate } from '@/modules/habits/lib/inputs'
import { workoutTemplateDto } from '@/modules/habits/lib/serialize'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const body = await readJson(request)
    const data = body ? readWorkoutTemplate(body, true) : null
    if (!id || !data) return apiError('invalidInput', 400)
    try {
      const { count } = await prisma.exerciseTemplate.updateMany({ where: { id, user_id: user.id }, data })
      if (count === 0) return apiError('notFound', 404)
    } catch (error) {
      if (isUniqueViolation(error)) return apiError('nameTaken', 409)
      throw error
    }
    return NextResponse.json(workoutTemplateDto(await prisma.exerciseTemplate.findUniqueOrThrow({ where: { id } })))
  })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.exerciseTemplate.deleteMany({ where: { id, user_id: user.id } })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ ok: true })
  })
}
