import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { createFolder, describe } from '@/modules/files/lib/items';
import { cleanName } from '@/modules/files/lib/names';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderId } from '@/lib/validate';

export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    const parentId = parseFolderId(body?.parentId);
    const name = cleanName(body?.name);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    if (!name) return apiError('invalidName', 400);
    const folder = await createFolder(user.id, parentId, name);
    const [dto] = await describe([folder], true);
    return NextResponse.json(dto, { status: 201 });
  });
}
