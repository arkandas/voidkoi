import { NextRequest, NextResponse } from 'next/server';
import { apiError, handle } from '@/lib/api-errors';
import { existingFiles } from '@/modules/files/lib/items';
import { splitPath } from '@/modules/files/lib/names';
import { readJson } from '@/lib/request';
import { requireUser } from '@/lib/session';
import { parseFolderId } from '@/lib/validate';

/** Most paths asked about at once: a big folder. */
const MAX_PATHS = 20_000;

/** Which of `{ parentId, paths }` already hold a file, by their place in `paths`, before uploading them there. */
export async function POST(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireUser();
    const body = await readJson(request);
    const parentId = parseFolderId(body?.parentId);
    if (parentId === undefined) return apiError('folderNotFound', 404);
    if (!Array.isArray(body?.paths) || body.paths.length > MAX_PATHS) return apiError('invalidInput', 400);
    const paths: string[][] = [];
    for (const raw of body.paths) {
      const segments = splitPath(raw);
      if (!segments || segments.length === 0) return apiError('invalidInput', 400);
      paths.push(segments);
    }
    const taken = new Set(await existingFiles(user.id, parentId, paths));
    const conflicts = paths.flatMap((segments, index) => (taken.has(segments.join('/')) ? [index] : []));
    return NextResponse.json({ conflicts });
  });
}
