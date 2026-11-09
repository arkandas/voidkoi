import { NextRequest, NextResponse } from 'next/server';
import { describeMe } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { isLocale } from '@/i18n/config';
import { LIMITS } from '@/lib/validate';

export async function GET() {
  return handle('loadFailed', async () => NextResponse.json(describeMe(await requireUser())));
}

/** The name others see, and the language last picked. */
export async function PATCH(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    const data: { name?: string | null; locale?: string } = {};
    if (body?.name !== undefined) {
      if (body.name !== null && typeof body.name !== 'string') return apiError('invalidName', 400);
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (name.length > LIMITS.name) return apiError('invalidName', 400);
      data.name = name || null;
    }
    if (body?.locale !== undefined) {
      if (!isLocale(body.locale)) return apiError('invalidLocale', 400);
      data.locale = body.locale;
    }
    const updated = await prisma.user.update({ where: { id: user.id }, data });
    return NextResponse.json(describeMe(updated));
  });
}
