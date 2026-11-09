import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { leave } from '@/modules/talk/backend/endpoints/groups';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Leave the group. The last one out takes it with them, and gets no group back. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    const result = await leave(await talkHub(), user.id, idOf((await params).id, 'groupNotFound'));
    return NextResponse.json(result ?? OK);
  });
}
