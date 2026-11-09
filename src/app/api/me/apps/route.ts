import { NextRequest, NextResponse } from 'next/server';
import { describeMe } from '@/lib/accounts';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { cleanAppKeys, isAppId, keepsAPart } from '@/modules/registry';

/** The apps the account uses and the parts of them it leaves out. At least one app, each with a part on. */
export async function PUT(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    if (!Array.isArray(body?.apps)) return apiError('missingFields', 400);
    const apps = cleanAppKeys(body.apps);
    if (!apps.some(isAppId) || !keepsAPart(apps)) return apiError('noApps', 400);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { apps, apps_chosen_at: user.apps_chosen_at ?? new Date() },
    });
    return NextResponse.json(describeMe(updated));
  });
}
