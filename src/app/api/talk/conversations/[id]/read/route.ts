import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { ApiError } from '@/lib/error-codes';
import { readJson } from '@/lib/request';
import { parseId } from '@/lib/validate';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { readConversation } from '@/modules/talk/backend/endpoints/conversations';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Read up to a message, or everything in the conversation when none is named. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    const body = await readJson(request);
    const messageId = body?.messageId === undefined ? null : parseId(body.messageId);
    if (body?.messageId !== undefined && messageId === null) throw new ApiError('invalidInput', 400);
    await readConversation(await talkHub(), user.id, idOf((await params).id, 'conversationNotFound'), messageId);
    return NextResponse.json(OK);
  });
}
