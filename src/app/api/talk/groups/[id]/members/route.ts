import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { addPeople } from '@/modules/talk/backend/endpoints/groups';
import { idOf } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

/** Put people in the group: the owner's to do. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    const groupId = idOf((await params).id, 'groupNotFound');
    return NextResponse.json(await addPeople(await talkHub(), user.id, groupId, (await readJson(request)) ?? {}));
  });
}
