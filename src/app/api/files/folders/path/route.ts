import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { ensurePath, toItemDto } from '@/modules/files/lib/items';
import { splitPath } from '@/modules/files/lib/names';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderId } from '@/lib/validate';

/** Make the folders of a dropped folder's path, where missing, and return the deepest one. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    const parentId = parseFolderId(body?.parentId);
    const segments = splitPath(body?.path);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    if (!segments) return apiError('invalidName', 400);
    const folder = await ensurePath(user.id, parentId, segments);
    return NextResponse.json({ folder: folder ? toItemDto(folder) : null });
  });
}
