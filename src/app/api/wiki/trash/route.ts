import { NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { emptyTrash, trashList } from '@/modules/wiki/lib/pages';
import { requireEditor } from '@/modules/wiki/lib/access';

export async function GET() {
  return handle('loadFailed', async () => {
    await requireEditor();
    return NextResponse.json(await trashList());
  });
}

/** Delete everything in the trash for good. */
export async function DELETE() {
  return handle('deleteFailed', async () => {
    await requireEditor();
    await emptyTrash();
    return NextResponse.json({ ok: true });
  });
}
