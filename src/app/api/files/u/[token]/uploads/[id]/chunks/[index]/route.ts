import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { isKey } from '@/lib/ids';
import { requireUploadLink, viaOf } from '@/modules/files/lib/upload-links';
import { chunkIndex } from '@/modules/files/lib/upload-requests';
import { receiveChunk } from '@/modules/files/lib/uploads';

/** One piece of an upload through the link. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ token: string; id: string; index: string }> }) {
  return handle('uploadFailed', async () => {
    const { token, id, index } = await params;
    const link = await requireUploadLink(token);
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    await receiveChunk(link.owner, id, chunkIndex(index), request.body, viaOf(link));
    return NextResponse.json({ ok: true });
  });
}
