import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { moveNode } from '@/modules/wiki/lib/pages';
import { readJson } from '@/lib/request';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseFolderId, parseId } from '@/lib/validate';

/** Put a page or folder into a folder (`parentId`, null for the top level) at `position` there. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const body = await readJson(request);
    const parentId = parseFolderId(body?.parentId);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    const position = typeof body?.position === 'number' && Number.isInteger(body.position) && body.position >= 0 ? body.position : 1_000_000;
    await moveNode(id, parentId, position);
    return NextResponse.json({ ok: true });
  });
}
