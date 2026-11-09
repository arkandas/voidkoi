import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { removePerson } from '@/modules/talk/backend/endpoints/groups';
import { idOf } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Take someone out of the group: the owner's to do. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    const { id, userId } = await params;
    return NextResponse.json(await removePerson(await talkHub(), user.id, idOf(id, 'groupNotFound'), idOf(userId, 'notInGroup')));
  });
}
