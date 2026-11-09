import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { conversationWith } from '@/modules/talk/backend/endpoints/conversations';
import { idOf } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/**
 * The 1:1 conversation with someone, made on first use, or brought back to a
 * list it was deleted from. A POST, so a link from another site can't do it.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    const otherId = idOf((await params).userId, 'userNotFound');
    return NextResponse.json(await conversationWith(await talkHub(), user.id, otherId));
  });
}
