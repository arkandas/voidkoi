import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { parseId } from '@/lib/validate'
import { readWorkout } from '@/modules/habits/lib/inputs'
import { workoutDto } from '@/modules/habits/lib/serialize'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    const body = await readJson(request)
    const data = body ? readWorkout(body, true) : null
    if (!id || !data) return apiError('invalidInput', 400)
    const { count } = await prisma.exerciseEntry.updateMany({ where: { id, user_id: user.id }, data })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json(workoutDto(await prisma.exerciseEntry.findUniqueOrThrow({ where: { id } })))
  })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const id = parseId((await params).id)
    if (!id) return apiError('notFound', 404)
    const { count } = await prisma.exerciseEntry.deleteMany({ where: { id, user_id: user.id } })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ ok: true })
  })
}
