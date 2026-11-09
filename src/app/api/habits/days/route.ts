import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { daysBetween } from '@/lib/days'
import { prisma } from '@/lib/prisma'
import { requireUser } from '@/lib/session'
import { isDayKey } from '@/modules/habits/lib/dates'
import { dbDate } from '@/modules/habits/lib/inputs'
import { foodDto, weighInDto, workoutDto } from '@/modules/habits/lib/serialize'
import { tracksOf } from '@/modules/habits/lib/tracks'

/** The longest stretch one request may ask for. */
const MAX_DAYS = 1000

/** Everything logged from one day to another (`?from=…&to=…`), for the parts of Habits the account uses. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const from = request.nextUrl.searchParams.get('from')
    const to = request.nextUrl.searchParams.get('to')
    if (!isDayKey(from) || !isDayKey(to) || from > to || daysBetween(from, to) > MAX_DAYS) return apiError('invalidInput', 400)
    const tracks = tracksOf(user.apps)
    const where = { user_id: user.id, date: { gte: dbDate(from), lte: dbDate(to) } }
    const [weights, foods, workouts] = await Promise.all([
      tracks.weight ? prisma.weightEntry.findMany({ where, orderBy: { date: 'asc' } }) : [],
      tracks.food ? prisma.calorieEntry.findMany({ where, orderBy: [{ date: 'asc' }, { created_at: 'asc' }] }) : [],
      tracks.training ? prisma.exerciseEntry.findMany({ where, orderBy: [{ date: 'asc' }, { created_at: 'asc' }] }) : [],
    ])
    return NextResponse.json({ weights: weights.map(weighInDto), foods: foods.map(foodDto), workouts: workouts.map(workoutDto) })
  })
}
