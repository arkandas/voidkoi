import { after, NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { canThumbnail } from '@/lib/file-types';
import { isKey } from '@/lib/ids';
import { queueThumbnail } from '@/modules/files/lib/thumbnails';
import { requireUploadLink, viaOf } from '@/modules/files/lib/upload-links';
import { completeUpload } from '@/modules/files/lib/uploads';

/** Finish an upload through the link. Like a small one, the answer says nothing about the stored file. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  return handle('uploadFailed', async () => {
    const { token, id } = await params;
    const link = await requireUploadLink(token);
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    const item = await completeUpload(link.owner, id, viaOf(link));
    if (canThumbnail(item.mime, item.name)) after(() => queueThumbnail(item.id));
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
