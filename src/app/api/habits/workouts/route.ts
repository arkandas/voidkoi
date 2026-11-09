import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { readWorkout } from '@/modules/habits/lib/inputs'
import { workoutDto } from '@/modules/habits/lib/serialize'

/** A workout done on a day. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const data = body ? readWorkout(body) : null
    if (!data?.date || !data.exercise_name || data.duration_minutes === undefined) return apiError('invalidInput', 400)
    const entry = await prisma.exerciseEntry.create({
      data: {
        user_id: user.id,
        date: data.date,
        exercise_name: data.exercise_name,
        duration_minutes: data.duration_minutes,
        calories_burned: data.calories_burned,
        exercise_type: data.exercise_type,
        notes: data.notes,
      },
    })
    return NextResponse.json(workoutDto(entry), { status: 201 })
  })
}
