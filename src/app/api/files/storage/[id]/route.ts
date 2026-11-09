import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { prisma } from '@/lib/prisma';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { parseBytes, parseId } from '@/lib/validate';
import { usageOf } from '@/modules/files/lib/settings';
import { toStorageUser } from '@/modules/files/lib/status';

type Params = { params: Promise<{ id: string }> };

/** Change a user's storage limit: the default, a size of their own, or none. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    await requireAdmin();
    const id = parseId((await params).id);
    if (!id) return apiError('userNotFound', 404);
    const body = await readJson(request);
    const mode = body?.quotaMode;

    let data: { quota_custom: boolean; quota_bytes: bigint | null };
    if (mode === 'default') data = { quota_custom: false, quota_bytes: null };
    else if (mode === 'unlimited') data = { quota_custom: true, quota_bytes: null };
    else if (mode === 'custom') {
      const bytes = parseBytes(body?.quota);
      if (bytes === null) return apiError('invalidQuota', 400);
      data = { quota_custom: true, quota_bytes: BigInt(bytes) };
    } else return apiError('invalidQuota', 400);

    const { count } = await prisma.user.updateMany({ where: { id }, data });
    if (count === 0) return apiError('userNotFound', 404);
    const user = await prisma.user.findUniqueOrThrow({ where: { id } });
    return NextResponse.json(toStorageUser(user, await usageOf(id)));
  });
}
