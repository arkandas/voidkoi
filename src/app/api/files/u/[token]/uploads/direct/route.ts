import { after, NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { canThumbnail } from '@/lib/file-types';
import { queueThumbnail } from '@/modules/files/lib/thumbnails';
import { requireUploadLink, viaOf } from '@/modules/files/lib/upload-links';
import { directFile } from '@/modules/files/lib/upload-requests';
import { directUpload } from '@/modules/files/lib/uploads';

/**
 * A small file through the link, in one request. The answer says nothing
 * about the stored file: its name might show what else is in the folder.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('uploadFailed', async () => {
    const link = await requireUploadLink((await params).token);
    const item = await directUpload(link.owner, directFile(request), request.body, viaOf(link));
    if (canThumbnail(item.mime, item.name)) after(() => queueThumbnail(item.id));
    return NextResponse.json({ ok: true }, { status: 201 });
  });
}
