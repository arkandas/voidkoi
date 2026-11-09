import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { discardDraft, saveDraft } from '@/modules/wiki/lib/pages';
import { readJson } from '@/lib/request';
import { requireEditor } from '@/modules/wiki/lib/access';
import { LIMITS, withoutNul } from '@/modules/wiki/lib/validate';
import { parseId } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/**
 * Save the title and text being edited: `{ title, content, version }`. A 409
 * with the other draft when someone saved since `version`.
 */
export async function PUT(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const body = await readJson(request);
    const title = typeof body?.title === 'string' ? withoutNul(body.title).replace(/\s+/g, ' ').trim() : null;
    const content = typeof body?.content === 'string' ? withoutNul(body.content) : null;
    const version = body?.version;
    if (title === null || title.length > LIMITS.title) return apiError('invalidTitle', 400);
    if (content === null || content.length > LIMITS.content) return apiError('invalidInput', 400);
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 0) return apiError('invalidInput', 400);
    const result = await saveDraft(user, id, { title, content, version });
    return 'error' in result ? NextResponse.json(result, { status: 409 }) : NextResponse.json(result);
  });
}

/** Throw the unpublished changes away. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await discardDraft(id);
    return NextResponse.json({ ok: true });
  });
}
