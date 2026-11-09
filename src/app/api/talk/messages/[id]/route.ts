import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { deleteMessage } from '@/modules/talk/backend/endpoints/conversations';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** `?scope=me` takes it out of this person's copy; `?scope=everyone` withdraws it from everyone. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await deleteMessage(await talkHub(), user.id, idOf((await params).id, 'messageNotFound'), request.nextUrl.searchParams.get('scope'));
    return NextResponse.json(OK);
  });
}
