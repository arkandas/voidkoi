import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { talkConfig } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

/** The largest file, and the STUN server under the name the browser reached this one at. */
export async function GET(request: NextRequest) {
  return handle('loadFailed', async () => {
    await requireTalkUser();
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return NextResponse.json(talkConfig(await talkHub(), host));
  });
}
