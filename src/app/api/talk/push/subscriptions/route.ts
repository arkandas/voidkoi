import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { OK } from '@/modules/talk/backend/endpoints/http';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { devices, subscribe, unsubscribe } from '@/modules/talk/backend/endpoints/push';
import { talkHub } from '@/modules/talk/backend/hub';

/** The devices this account gets notifications on. */
export async function GET() {
  return handle('loadFailed', async () => {
    const user = await requireTalkUser();
    return NextResponse.json(await devices(await talkHub(), user.id));
  });
}

/** Notifications on for this device: what `PushSubscription.toJSON()` gives. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    limit('push', user.id, 30, 10);
    await subscribe(await talkHub(), user, await readJson(request));
    return NextResponse.json(OK, { status: 201 });
  });
}

/** Notifications off for one device: `{ endpoint }`. */
export async function DELETE(request: NextRequest) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await unsubscribe(await talkHub(), user.id, await readJson(request));
    return NextResponse.json(OK);
  });
}
