import { NextRequest } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { serveAttachment } from '@/modules/talk/backend/endpoints/files';
import { talkHub } from '@/modules/talk/backend/hub';

/** The small copy of a shared picture. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    return serveAttachment(await talkHub(), user.id, (await params).id, 'previews', { download: false, etag: request.headers.get('if-none-match') });
  });
}
