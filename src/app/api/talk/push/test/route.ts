import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { OK } from '@/modules/talk/backend/endpoints/http';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { test } from '@/modules/talk/backend/endpoints/push';
import { talkHub } from '@/modules/talk/backend/hub';

/** A notification to this device now, so turning them on can be proved on the spot. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    limit('push-test', user.id, 10, 1);
    await test(await talkHub(), user.id, await readJson(request));
    return NextResponse.json(OK);
  });
}
