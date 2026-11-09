import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { isKey } from '@/lib/ids';
import { requireUploadLink, viaOf } from '@/modules/files/lib/upload-links';
import { cancelUpload, uploadStatus } from '@/modules/files/lib/uploads';

type Params = { params: Promise<{ token: string; id: string }> };

/** Which pieces have arrived, so an interrupted upload picks up where it stopped. */
export async function GET(_request: NextRequest, { params }: Params) {
  return handle('uploadFailed', async () => {
    const { token, id } = await params;
    const link = await requireUploadLink(token);
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    return NextResponse.json(await uploadStatus(link.owner, id, viaOf(link)));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const { token, id } = await params;
    const link = await requireUploadLink(token);
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    await cancelUpload(link.owner, id, viaOf(link));
    return NextResponse.json({ ok: true });
  });
}
