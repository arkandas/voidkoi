import { NextRequest } from 'next/server';
import { visibleItem } from '@/modules/files/lib/items';
import { cleanName } from '@/modules/files/lib/names';
import { currentUser } from '@/lib/session';
import { zipEntries, zipResponse } from '@/modules/files/lib/zip';

/** Several items, or a folder, as one zip: `?ids=1,2,3&name=Photos`. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return new Response(null, { status: 401 });

  const ids = (request.nextUrl.searchParams.get('ids') ?? '').split(',').map(Number);
  if (ids.length === 0 || ids.length > 1000 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) {
    return new Response(null, { status: 400 });
  }
  for (const id of ids) {
    if (!(await visibleItem(user.id, id).catch(() => null))) return new Response(null, { status: 404 });
  }

  const name = cleanName(request.nextUrl.searchParams.get('name')) ?? 'Files';
  return zipResponse(await zipEntries([...new Set(ids)]), `${name}.zip`);
}
