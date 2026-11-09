import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { createGroup } from '@/modules/talk/backend/endpoints/groups';
import { limit } from '@/modules/talk/backend/endpoints/people';
import { talkHub } from '@/modules/talk/backend/hub';

/** A new group, owned by whoever makes it. */
export async function POST(request: NextRequest) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    limit('group', user.id, 30, 10);
    const result = await createGroup(await talkHub(), user.id, (await readJson(request)) ?? {});
    return NextResponse.json(result, { status: 201 });
  });
}
