import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { createNode, parseTitle } from '@/modules/wiki/lib/pages';
import { readJson } from '@/lib/request';
import { requireEditor } from '@/modules/wiki/lib/access';
import { getSettings } from '@/modules/wiki/lib/settings';
import { parseFolderId } from '@/lib/validate';
import { loadIndex } from '@/modules/wiki/lib/wiki';

/** A new page or folder: `{ kind: 'page' | 'folder', parentId, title }`. A page starts as a draft. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireEditor();
    const body = await readJson(request);
    const kind = body?.kind === 'folder' ? 'FOLDER' : body?.kind === 'page' ? 'PAGE' : null;
    if (!kind) return apiError('invalidInput', 400);
    const title = parseTitle(body?.title);
    if (!title) return apiError('invalidTitle', 400);
    const parentId = parseFolderId(body?.parentId);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    const node = await createNode(user, { kind, parentId, title });
    const entry = (await loadIndex(await getSettings())).byId.get(node.id);
    return NextResponse.json({ id: node.id, path: entry?.path ?? node.slug }, { status: 201 });
  });
}
