import { NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { pushKey } from '@/modules/talk/backend/endpoints/push';
import { talkHub } from '@/modules/talk/backend/hub';

/** The public key notifications are signed with: what a browser subscribes with. */
export async function GET() {
  return handle('loadFailed', async () => {
    await requireTalkUser();
    return NextResponse.json(pushKey(await talkHub()));
  });
}
