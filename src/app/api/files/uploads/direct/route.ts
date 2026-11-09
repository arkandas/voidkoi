import { after, NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { canThumbnail } from '@/lib/file-types';
import { describe } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { queueThumbnail } from '@/modules/files/lib/thumbnails';
import { directFile } from '@/modules/files/lib/upload-requests';
import { directUpload } from '@/modules/files/lib/uploads';

/**
 * A small file in one request: the body is the file itself, and its name,
 * type, folder and whether it replaces a file of the same name come in headers.
 */
export async function POST(request: NextRequest) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    const item = await directUpload(user, directFile(request), request.body);
    if (canThumbnail(item.mime, item.name)) after(() => queueThumbnail(item.id));
    const [dto] = await describe([item], true);
    return NextResponse.json(dto, { status: 201 });
  });
}
