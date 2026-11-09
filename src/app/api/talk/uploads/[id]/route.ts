import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { cancelUpload } from '@/modules/talk/backend/endpoints/files';
import { OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Throw away an upload that was never sent. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await cancelUpload(await talkHub(), user.id, (await params).id);
    return NextResponse.json(OK);
  });
}
