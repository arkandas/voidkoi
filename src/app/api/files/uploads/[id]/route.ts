import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { isKey } from '@/lib/ids';
import { requireUser } from '@/lib/session';
import { cancelUpload, uploadStatus } from '@/modules/files/lib/uploads';

type Params = { params: Promise<{ id: string }> };

/** Which pieces have arrived, so an interrupted upload picks up where it stopped. */
export async function GET(_request: NextRequest, { params }: Params) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    return NextResponse.json(await uploadStatus(user, id));
  });
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    await cancelUpload(user, id);
    return NextResponse.json({ ok: true });
  });
}
