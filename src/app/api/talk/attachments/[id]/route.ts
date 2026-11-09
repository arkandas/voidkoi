import { NextRequest } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { serveAttachment } from '@/modules/talk/backend/endpoints/files';
import { talkHub } from '@/modules/talk/backend/hub';

/** A shared file. A picture opens in the page unless `?download` asks otherwise; anything else is a download. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    return serveAttachment(await talkHub(), user.id, (await params).id, 'files', {
      download: request.nextUrl.searchParams.has('download'),
      etag: request.headers.get('if-none-match'),
    });
  });
}
