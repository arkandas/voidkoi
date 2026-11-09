import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { deleteCall } from '@/modules/talk/backend/endpoints/calls';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Take one call out of this person's log. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await deleteCall(await talkHub(), user.id, idOf((await params).id, 'callNotFound'));
    return NextResponse.json(OK);
  });
}
