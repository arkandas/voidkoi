import { NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUploadLink, viaOf } from '@/modules/files/lib/upload-links';
import { readNewUpload } from '@/modules/files/lib/upload-requests';
import { startUpload, toSession } from '@/modules/files/lib/uploads';

/** Start a chunked upload through the link: `{ name, size, type, parentId }`. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  return handle('uploadFailed', async () => {
    const link = await requireUploadLink((await params).token);
    const upload = await startUpload(link.owner, await readNewUpload(request), viaOf(link));
    return NextResponse.json(toSession(upload), { status: 201 });
  });
}
