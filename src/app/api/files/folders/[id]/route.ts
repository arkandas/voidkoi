import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { listFolder } from '@/modules/files/lib/items';
import { requireUser } from '@/lib/session';
import { parseFolderId } from '@/lib/validate';

/** What is in a folder: "root" for the top of My files. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const folderId = parseFolderId((await params).id);
    if (folderId === undefined) return apiError('notFound', 404);
    return NextResponse.json(await listFolder(user, folderId));
  });
}
