import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { deleteForever } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await deleteForever(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
