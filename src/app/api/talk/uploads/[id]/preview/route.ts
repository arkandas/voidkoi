import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { uploadPreview } from '@/modules/talk/backend/endpoints/files';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

/** The small picture the sender's browser made, with the original's size in pixels. Only before it is sent. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('uploadFailed', async () => {
    const user = await requireTalkUser();
    limit('preview', user.id, 120, 10);
    const length = request.headers.get('content-length');
    const result = await uploadPreview(await talkHub(), user.id, (await params).id, {
      body: request.body,
      contentLength: length === null ? null : Number(length),
      contentType: request.headers.get('content-type'),
      fileName: null,
      fileType: null,
      width: request.headers.get('x-image-width'),
      height: request.headers.get('x-image-height'),
    });
    return NextResponse.json(result);
  });
}
