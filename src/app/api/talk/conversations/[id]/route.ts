import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { deleteConversation } from '@/modules/talk/backend/endpoints/conversations';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Delete a chat from this person's list, with their copy of it. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await deleteConversation(await talkHub(), user.id, idOf((await params).id, 'conversationNotFound'));
    return NextResponse.json(OK);
  });
}
