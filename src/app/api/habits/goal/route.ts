import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { readGoal } from '@/modules/habits/lib/inputs'
import { goalDto } from '@/modules/habits/lib/serialize'

/** The weight goal and the weekly workouts; empty until set. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    return NextResponse.json(goalDto(await prisma.goal.findUnique({ where: { user_id: user.id } })))
  })
}

/** Changes the fields the body has; null clears one. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const data = body ? readGoal(body) : null
    if (!data) return apiError('invalidInput', 400)
    const goal = await prisma.goal.upsert({ where: { user_id: user.id }, create: { user_id: user.id, ...data }, update: data })
    return NextResponse.json(goalDto(goal))
  })
}
