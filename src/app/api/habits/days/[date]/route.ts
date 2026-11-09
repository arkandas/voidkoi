import { NextResponse } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import type { DayDto } from '@/modules/habits/lib/api-types'
import { isDayKey } from '@/modules/habits/lib/dates'
import { dbDate } from '@/modules/habits/lib/inputs'
import { foodDto, weighInDto, workoutDto } from '@/modules/habits/lib/serialize'
import { tracksOf } from '@/modules/habits/lib/tracks'

/** One day: its weigh-in and the one before it, its food and its workouts. */
export async function GET(_request: Request, { params }: { params: Promise<{ date: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const { date } = await params
    if (!isDayKey(date)) return apiError('invalidInput', 400)
    const tracks = tracksOf(user.apps)
    const day = dbDate(date)
    const where = { user_id: user.id, date: day }
    const [weight, previous, foods, workouts] = await Promise.all([
      tracks.weight ? prisma.weightEntry.findFirst({ where }) : null,
      tracks.weight ? prisma.weightEntry.findFirst({ where: { user_id: user.id, date: { lt: day } }, orderBy: { date: 'desc' } }) : null,
      tracks.food ? prisma.calorieEntry.findMany({ where, orderBy: { created_at: 'asc' } }) : [],
      tracks.training ? prisma.exerciseEntry.findMany({ where, orderBy: { created_at: 'asc' } }) : [],
    ])
    const body: DayDto = {
      date,
      weight: weight ? weighInDto(weight).weight : null,
      previous: previous ? weighInDto(previous) : null,
      foods: foods.map(foodDto),
      workouts: workouts.map(workoutDto),
    }
    return NextResponse.json(body)
  })
}
