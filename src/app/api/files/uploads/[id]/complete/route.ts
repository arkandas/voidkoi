import { after, NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { canThumbnail } from '@/lib/file-types';
import { isKey } from '@/lib/ids';
import { describe } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { queueThumbnail } from '@/modules/files/lib/thumbnails';
import { completeUpload } from '@/modules/files/lib/uploads';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    const { id } = await params;
    if (!isKey(id)) return apiError('uploadNotFound', 404);
    const item = await completeUpload(user, id);
    if (canThumbnail(item.mime, item.name)) after(() => queueThumbnail(item.id));
    const [dto] = await describe([item], true);
    return NextResponse.json(dto, { status: 201 });
  });
}
