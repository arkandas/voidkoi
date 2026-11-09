import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { ensurePath, isWithin } from '@/modules/files/lib/items';
import { splitPath } from '@/modules/files/lib/names';
import { readJson } from '@/lib/request';
import { requireUploadLink } from '@/modules/files/lib/upload-links';
import { parseFolderId } from '@/lib/validate';

/**
 * Make the folders of a folder dropped on the link's page, inside the link's
 * folder, and return the deepest one. Only its id: nothing of what is there.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('saveFailed', async () => {
    const link = await requireUploadLink((await params).token);
    const body = await readJson(request);
    const parentId = parseFolderId(body?.parentId);
    const segments = splitPath(body?.path);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    if (!segments) return apiError('invalidName', 400);
    const start = parentId ?? link.folder_id;
    if (!(await isWithin(link.folder_id, start))) return apiError('folderNotFound', 404);
    const folder = await ensurePath(link.owner_id, start, segments);
    return NextResponse.json({ folder: folder ? { id: folder.id } : null });
  });
}
