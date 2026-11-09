import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { pageDetail, parseTitle, trashNode, updateNode, type NodeChanges } from '@/modules/wiki/lib/pages';
import { readJson } from '@/lib/request';
import { requireEditor } from '@/modules/wiki/lib/access';
import { isVisibility, LIMITS } from '@/modules/wiki/lib/validate';
import { parseId } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/** A page's or folder's settings and text, for an editor. */
export async function GET(_request: NextRequest, { params }: Params) {
  return handle('loadFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    return NextResponse.json(await pageDetail(id));
  });
}

/**
 * Change what applies at once: a folder's title, the address (`slug`), who
 * can read it (`visibility`, with `password` for Password).
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const body = (await readJson(request)) ?? {};
    const changes: NodeChanges = {};
    if ('title' in body) {
      const title = parseTitle(body.title);
      if (!title) return apiError('invalidTitle', 400);
      changes.title = title;
    }
    if ('slug' in body) {
      if (typeof body.slug !== 'string') return apiError('invalidSlug', 400);
      changes.slug = body.slug.trim().toLowerCase();
    }
    if ('visibility' in body) {
      if (!isVisibility(body.visibility)) return apiError('invalidInput', 400);
      changes.visibility = body.visibility;
    }
    if ('password' in body && body.password !== undefined && body.password !== null && body.password !== '') {
      if (typeof body.password !== 'string' || body.password.length > LIMITS.password) return apiError('invalidInput', 400);
      changes.password = body.password;
    }
    await updateNode(id, changes);
    return NextResponse.json(await pageDetail(id));
  });
}

/** To the trash, with everything inside it. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await trashNode(id);
    return NextResponse.json({ ok: true });
  });
}
