import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { deleteForever } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';
import { parseId } from '@/lib/validate';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    await requireEditor();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await deleteForever(id);
    return NextResponse.json({ ok: true });
  });
}
