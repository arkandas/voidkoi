import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { emptyTrash, listTrash } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';

export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    return NextResponse.json(await listTrash(user.id));
  });
}

export async function DELETE() {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    await emptyTrash(user.id);
    return NextResponse.json({ ok: true });
  });
}
