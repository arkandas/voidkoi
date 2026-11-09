import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { sharedFiles } from '@/modules/talk/backend/endpoints/files';
import { pageLimit } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Every file sent and received, newest first: `?filter=all|sent|received`. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    const query = request.nextUrl.searchParams;
    const page = await sharedFiles(await talkHub(), user.id, {
      filter: query.get('filter'),
      before: query.get('before'),
      limit: pageLimit(query.get('limit')),
    });
    return NextResponse.json(page);
  });
}
