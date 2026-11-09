import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { leaveShare } from '@/modules/files/lib/shares';
import { parseId } from '@/lib/validate';

/** Take something somebody shared off my list. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await leaveShare(user.id, id);
    return NextResponse.json({ ok: true });
  });
}
