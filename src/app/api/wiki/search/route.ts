import { NextRequest, NextResponse } from 'next/server';
import { handle } from '@/lib/api-errors';
import { search } from '@/modules/wiki/lib/search';
import { wikiContext } from '@/modules/wiki/lib/wiki';

/** Pages and folders matching `?q=`, among those this reader sees. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const query = (request.nextUrl.searchParams.get('q') ?? '').slice(0, 200);
    const { index, reader } = await wikiContext();
    return NextResponse.json(await search(index, reader, query));
  });
}
