import { NextRequest, NextResponse } from 'next/server';

import { handle } from '@/lib/api-errors';
import { readJson } from '@/lib/request';
import { requireTalkUser } from '@/modules/talk/backend/endpoints/account';
import { deleteForEveryone, renameGroupTo } from '@/modules/talk/backend/endpoints/groups';
import { idOf, OK } from '@/modules/talk/backend/endpoints/http';
import { talkHub } from '@/modules/talk/backend/hub';

type Params = { params: Promise<{ id: string }> };

/** Rename it: the owner's to do. */
export async function PATCH(request: NextRequest, { params }: Params) {
  return handle('saveFailed', async () => {
    const user = await requireTalkUser();
    const groupId = idOf((await params).id, 'groupNotFound');
    return NextResponse.json(await renameGroupTo(await talkHub(), user.id, groupId, (await readJson(request)) ?? {}));
  });
}

/** The owner's: gone for everyone, with its messages and files. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  return handle('deleteFailed', async () => {
    const user = await requireTalkUser();
    await deleteForEveryone(await talkHub(), user.id, idOf((await params).id, 'groupNotFound'));
    return NextResponse.json(OK);
  });
}
