import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireAdmin } from '@/lib/session';
import { parseId } from '@/lib/validate';
import { setEditor } from '@/modules/wiki/lib/members';

/** `{ editor }`: whether the account writes in the wiki. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    await requireAdmin();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const editor = (await readJson(request))?.editor;
    if (typeof editor !== 'boolean') return apiError('invalidInput', 400);
    return NextResponse.json(await setEditor(id, editor));
  });
}
