import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { isUniqueViolation, readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { readWorkoutTemplate } from '@/modules/habits/lib/inputs'
import { workoutTemplateDto } from '@/modules/habits/lib/serialize'

/** Saved workouts, by name. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const templates = await prisma.exerciseTemplate.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } })
    return NextResponse.json(templates.map(workoutTemplateDto))
  })
}

export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const data = body ? readWorkoutTemplate(body) : null
    if (!data?.name || data.duration_minutes === undefined) return apiError('invalidInput', 400)
    try {
      const template = await prisma.exerciseTemplate.create({
        data: {
          user_id: user.id,
          name: data.name,
          duration_minutes: data.duration_minutes,
          calories: data.calories,
          exercise_type: data.exercise_type,
          notes: data.notes,
        },
      })
      return NextResponse.json(workoutTemplateDto(template), { status: 201 })
    } catch (error) {
      if (isUniqueViolation(error)) return apiError('nameTaken', 409)
      throw error
    }
  })
}
