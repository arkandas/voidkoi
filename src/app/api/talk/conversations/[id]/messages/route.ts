import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { clearChat, timeline } from '@/modules/talk/backend/endpoints/conversations';
import { idOf, OK, pageLimit } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Messages and finished calls together, newest page first. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    const query = request.nextUrl.searchParams;
    const page = await timeline(await talkHub(), user.id, idOf((await params).id, 'conversationNotFound'), {
      before: query.get('before'),
      limit: pageLimit(query.get('limit')),
    });
    return NextResponse.json(page);
  });
}

/** Clear this person's copy of the conversation. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await clearChat(await talkHub(), user.id, idOf((await params).id, 'conversationNotFound'));
    return NextResponse.json(OK);
  });
}
