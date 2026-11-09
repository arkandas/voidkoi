import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { readFood } from '@/modules/habits/lib/inputs'
import { foodDto } from '@/modules/habits/lib/serialize'

/** Something eaten on a day. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const data = body ? readFood(body) : null
    if (!data?.date || !data.food_item || data.calories === undefined) return apiError('invalidInput', 400)
    const entry = await prisma.calorieEntry.create({
      data: { user_id: user.id, date: data.date, food_item: data.food_item, calories: data.calories, quantity: data.quantity, meal_type: data.meal_type },
    })
    return NextResponse.json(foodDto(entry), { status: 201 })
  })
}
