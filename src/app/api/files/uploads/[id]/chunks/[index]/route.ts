import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { isKey } from '@/lib/ids';
import { requireUser } from '@/lib/session';
import { chunkIndex } from '@/modules/files/lib/upload-requests';
import { receiveChunk } from '@/modules/files/lib/uploads';

/** One piece of an upload, as raw bytes. Pieces can arrive in any order, and again. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string; index: string }> }) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    const { id, index } = await params;
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    await receiveChunk(user, id, chunkIndex(index), request.body);
    return NextResponse.json({ ok: true });
  });
}
