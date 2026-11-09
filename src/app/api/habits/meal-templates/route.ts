import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { isUniqueViolation, readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { readMealTemplate } from '@/modules/habits/lib/inputs'
import { mealTemplateDto } from '@/modules/habits/lib/serialize'

/** Saved meals, by name. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser()
    const templates = await prisma.mealTemplate.findMany({ where: { user_id: user.id }, orderBy: { name: 'asc' } })
    return NextResponse.json(templates.map(mealTemplateDto))
  })
}

export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const body = await readJson(request)
    const data = body ? readMealTemplate(body) : null
    if (!data?.name || data.calories === undefined) return apiError('invalidInput', 400)
    try {
      const template = await prisma.mealTemplate.create({
        data: {
          user_id: user.id,
          name: data.name,
          calories: data.calories,
          default_quantity: data.default_quantity,
          meal_type: data.meal_type,
          description: data.description,
        },
      })
      return NextResponse.json(mealTemplateDto(template), { status: 201 })
    } catch (error) {
      if (isUniqueViolation(error)) return apiError('nameTaken', 409)
      throw error
    }
  })
}
