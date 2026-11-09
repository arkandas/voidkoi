import { NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { requireUser } from '@/lib/session';
import { readNewUpload } from '@/modules/files/lib/upload-requests';
import { startUpload, toSession } from '@/modules/files/lib/uploads';

/** Start a chunked upload: `{ name, size, type, parentId, replace }`. */
export async function POST(request: NextRequest) {
  return handle('uploadFailed', async () => {
    const user = await requireUser();
    const upload = await startUpload(user, await readNewUpload(request));
    return NextResponse.json(toSession(upload), { status: 201 });
  });
}
