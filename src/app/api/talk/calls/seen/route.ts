import { NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { seeMissedCalls } from '@/modules/talk/backend/endpoints/calls';
import { OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Opening the call log sees the missed calls, and their badge goes. */
export async function POST() {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    await seeMissedCalls(await talkHub(), user.id);
    return NextResponse.json(OK);
  });
}
