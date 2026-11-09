import { after, NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { EDIT_LIMIT } from '@/lib/file-types';
import { describe, visibleItem } from '@/modules/files/lib/items';
import { serveFile } from '@/modules/files/lib/serve';
import { currentUser, requireUser } from '@/lib/session';
import { queueThumbnail } from '@/modules/files/lib/thumbnails';
import { saveText, versionOf } from '@/modules/files/lib/uploads';
import { parseId } from '@/lib/validate';

/** A file's bytes, shown in the page when that is safe, or as a download with `?download`. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });
  const access = await visibleItem(user.id, parseId((await params).id)).catch(() => null);
  if (!access || access.item.kind !== 'FILE') return new Response(null, { status: 404 });
  return serveFile(request, access.item, { download: request.nextUrl.searchParams.has('download') });
}

/**
 * New contents for a text file edited in the app, by its owner. The body is
 * the text; `If-Match` carries the version (ETag) it was edited from.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireUser();
    const size = Number(request.headers.get('content-length'));
    if (!Number.isSafeInteger(size) || size < 0) return apiError('invalidInput', 400);
    if (size > EDIT_LIMIT) return apiError('fileTooLarge', 413);
    const item = await saveText(user, parseId((await params).id), request.headers.get('if-match'), size, request.body);
    after(() => queueThumbnail(item.id));
    const [dto] = await describe([item], true);
    return NextResponse.json(dto, { headers: { ETag: versionOf(item) } });
  });
}
