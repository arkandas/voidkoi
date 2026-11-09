import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { upload } from '@/modules/talk/backend/endpoints/files';
import { idOf } from '@/modules/talk/backend/endpoints/http';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

/** A file for a conversation, as the raw bytes, streamed to disk. It is sent as a message afterwards. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('uploadFailed', async () => {
    const user = await requireTalkUser();
    limit('upload', user.id, 120, 10);
    const length = request.headers.get('content-length');
    const result = await upload(await talkHub(), user.id, idOf((await params).id, 'conversationNotFound'), {
      body: request.body,
      contentLength: length === null ? null : Number(length),
      contentType: request.headers.get('content-type'),
      fileName: request.headers.get('x-file-name'),
      fileType: request.headers.get('x-file-type'),
    });
    return NextResponse.json(result, { status: 201 });
  });
}
