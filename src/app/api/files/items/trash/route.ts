import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { trashItems } from '@/modules/files/lib/items';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseIds } from '@/lib/validate';

export async function POST(request: NextRequest) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const ids = parseIds((await readJson(request))?.ids);
    if (!ids) return apiError('invalidInput', 400);
    return NextResponse.json({ trashed: await trashItems(user.id, ids) });
  });
}
