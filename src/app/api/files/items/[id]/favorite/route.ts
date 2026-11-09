import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { addFavorite, removeFavorite } from '@/modules/files/lib/favorites';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

type Params = { params: Promise<{ id: string }> };

/** Star something you can open: your own, or something shared with you. */
export async function PUT(_request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    await addFavorite(user.id, parseId((await params).id));
    return NextResponse.json({ favorite: true });
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    await removeFavorite(user.id, id);
    return NextResponse.json({ favorite: false });
  });
}
