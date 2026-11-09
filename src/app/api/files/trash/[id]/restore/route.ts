import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { describe, restoreItem } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { parseId } from '@/lib/validate';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('restoreFailed', async () => {
    const user = await requireUser();
    const id = parseId((await params).id);
    if (!id) return apiError('notFound', 404);
    const [item] = await describe([await restoreItem(user.id, id)], true, user.id);
    return NextResponse.json(item);
  });
}
