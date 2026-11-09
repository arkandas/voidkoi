import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { describe, moveItems } from '@/modules/files/lib/items';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderId, parseIds } from '@/lib/validate';

export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    const ids = parseIds(body?.ids);
    const parentId = parseFolderId(body?.parentId);
    if (!ids) return apiError('invalidInput', 400);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    return NextResponse.json(await describe(await moveItems(user.id, ids, parentId), true, user.id));
  });
}
