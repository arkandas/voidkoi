import { NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { listConversations } from '@/modules/talk/backend/endpoints/conversations';
import { talkHub } from '@/modules/talk/backend/hub';

export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    return NextResponse.json(await listConversations(await talkHub(), user.id));
  });
}
