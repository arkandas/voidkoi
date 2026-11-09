import { NextResponse, type NextRequest } from 'next/server'

import { apiError, handle } from '@/lib/api-errors'
import { prisma } from '@/lib/prisma'
import { readJson } from '@/lib/request'
import { requireUser } from '@/lib/session'
import { isDayKey } from '@/modules/habits/lib/dates'
import { dbDate, readWeight } from '@/modules/habits/lib/inputs'
import { weighInDto } from '@/modules/habits/lib/serialize'

type Params = { params: Promise<{ date: string }> }

/** The weigh-in of a day: a new one, or a new weight for the one it has. */
export async function PUT(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser()
    const { date } = await params
    const body = await readJson(request)
    const weight = body ? readWeight(body) : null
    if (!isDayKey(date) || weight === null) return apiError('invalidInput', 400)
    const day = dbDate(date)
    const entry = await prisma.weightEntry.upsert({
      where: { user_id_date: { user_id: user.id, date: day } },
      create: { user_id: user.id, date: day, weight },
      update: { weight },
    })
    return NextResponse.json(weighInDto(entry))
  })
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser()
    const { date } = await params
    if (!isDayKey(date)) return apiError('invalidInput', 400)
    const { count } = await prisma.weightEntry.deleteMany({ where: { user_id: user.id, date: dbDate(date) } })
    if (count === 0) return apiError('notFound', 404)
    return NextResponse.json({ ok: true })
  })
}
